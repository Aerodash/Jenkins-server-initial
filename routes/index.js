const express = require('express');
const EventEmitter = require('events');
const fs = require('fs');
const router = express.Router();
const uniqBy = require('lodash.uniqby');

module.exports = function(io) {

  const JenkinsService = require('./jenkins');
  const J = new JenkinsService();

  router.get('/', function(req, res) {
    res.json({hello: 'There'});
  });

  // GET /jobs OR /jobs?params=true
  router.get('/jobs', function(req, res) {
    if (req.query.params) {
      J.listJobs((jobs) => {
        let j = 0;
        for (let i = 0; i < jobs.length; i++) {
          J.getJobParams(jobs[i].name, (params) => {
            jobs[i].params = params;
            if (j == jobs.length - 1) res.json(jobs);
          });
        }
      })
    } else {
      J.listJobs((jobs) => {
        res.json(jobs);
      });
    }
      
  });

  // GET /jobParams?name=?
  router.get('/jobParams', function(req, res) {
    J.getJobParams(req.query.name, (params) => res.json(params));
  });

  function saveFlow(flowName, flow) {
    const timestamp = new Date().getTime();
    const file = {
      timestamp,
      name: flowName,
      parameters: flow.parameters || {},
      flow: flow.flow || []
    }
    // Clear status attribute
    for (let i = 0; i < flow.length; i++) {
      if (flow[i] instanceof Array) {
        for (let j = 0; j < flow[i].length; j++) {
          flow[i][j].status = null;
        }
      } else {
        flow[i].status = null;
      }
    }
    // Check if file exists
    console.log(typeof(file));
    fs.writeFileSync('storage/' + flowName + '.json', JSON.stringify(file));
    return file;
  }

  // POST /saveFlow?name=?
  router.post('/saveFlow', function(req, res) {
    
    req.on('data', (data) => {
      const flow = JSON.parse(data.toString());
      saveFlow(req.query.name, flow);
      res.json({ timestamp, name: req.query.name });
    });
  });

  router.get('/flowExists', function(req, res) {
    fs.readdir('storage', (err, files) => {
      if (err) console.error(err);
      for (let i = 0; i < files.length; i++) {
        if (files[i].replace('.json', '') === req.query.name) {
          res.json({ name: req.query.name, exists: true })
          return;
        }
      }
      res.json({ name: req.query.name, exists: false })
    })
  });

  router.get('/flows', function(req, res) {
    fs.readdir('storage', (err, files) => {
      if (err) console.error(err);
      let result = [];
      files.forEach((file, index) => {
        const data = fs.readFileSync('storage/' + file);
        result.push(JSON.parse(data.toString()));
        if (index === files.length - 1) res.json(result);
      });
    })
  });

  router.get('/flows/:flowName', function(req, res) {
    let data;
    try {
      data = fs.readFileSync('storage/' + req.params.flowName + '.json');
      let flow = JSON.parse(data.toString());
      let updateDone = false;
      // Get job parameters in case they changed (Modified from Jenkins)!
      const updateJobParams = (cb) => {
        let counter = 0;
        let maxCount = 0;

        flow.flow.forEach((job) => {
          if (job instanceof Array) job.forEach((j) => maxCount++);
          else maxCount++;
        })

        console.log(maxCount)

        for (let i = 0; i < flow.flow.length; i++) {
          if (flow.flow[i] instanceof Array) {
            for (let j = 0; j < flow.flow[i].length; j++) {
              J.getJobParams(flow.flow[i][j].name, (params) => {
                if (counter == maxCount) return;
                flow.flow[i][j].params = params;
                counter++;
                console.log(i, j, counter, flow.flow[i][j].name, params.map((p) => p.name))
                if (counter == maxCount && !updateDone) {
                  cb();
                  updateDone = true
                }
              })
            }
          } else {
            J.getJobParams(flow.flow[i].name, (params) => {
              if (counter == maxCount) return;
              flow.flow[i].params = params;
              counter++;
              console.log(i, counter, flow.flow[i].name, params.map((p) => p.name))
              if (counter == maxCount && !updateDone) {
                cb();
                updateDone = true
              }
            })
          }
        }
      };
      updateJobParams(() => {
        // Save flow with updated jobs
        // get updated flow
        flow.parameters = getFlowParams(flow.name);
        const updatedFlow = saveFlow(flow.name, flow);

        res.json(updatedFlow);
      })
      
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log(e.message);
        res.json({'error': 'NOT_FOUND'});
      } 
    }
  });

  function getFlowParams(flowName) {
    let data;
    try {
      data = fs.readFileSync('storage/' + flowName + '.json');
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log(e.message);
        res.json({'error': 'NOT_FOUND'});
        return;
      } 
    }
    let jobs = [].concat(JSON.parse(data.toString()).flow);
    
    if (!jobs || jobs == undefined || jobs == null || jobs.length === 0) return res.json({});

    const flatten = (prev, curr) => {
        if (!(prev instanceof Array)) {
            prev = [prev];
        }
        return prev.concat(curr);
    };
    
    if (jobs.length == 1) {
      jobs.push({});
    }

    let params = jobs
                .reduce(flatten)
                .filter((job) => job.params !== undefined && job.params.length > 0)
                .map((job) => job.params)
                .reduce(flatten);
    params = uniqBy(params, 'name');
    let paramsMap = {};
    params.forEach((p) => {
        let obj = { type: p.type }
        if (p.choices) obj['choices'] = p.choices;
        paramsMap[p.name] = obj;
    })

    return paramsMap;
  }

  router.get('/flows/:flowName/params', function(req, res) {
    const paramsMap = getFlowParams(req.params.flowName);
    res.json(paramsMap);
  })

  router.post('/runFlow', function(req, res) {    
    req.on('data', (data) => {
      let flow = JSON.parse(data.toString());  
      const flowEmitter = new EventEmitter();
      flowEmitter.on('flow-update', (state) => io.emit('flow-update', state));
      J.buildFlow(flow, flowEmitter);   
      res.json({status: "OK", jobs});
    });
  });

  return router;
};