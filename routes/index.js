var express = require('express');
const EventEmitter = require('events');
const fs = require('fs');
var router = express.Router();

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

  // POST /saveFlow?name=?
  router.post('/saveFlow', function(req, res) {
    
    req.on('data', (data) => {
      const flow = JSON.parse(data.toString());
      const timestamp = new Date().getTime();
      const file = {
        timestamp,
        name: req.query.name,
        flow
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
      fs.writeFile('storage/' + req.query.name + '.json', JSON.stringify(file), (err) => err ? console.error(err) : err);
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
      res.json(JSON.parse(data.toString()));
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log(e.message);
        res.json({'Error': 'NOT_FOUND'});
      } 
    }
  });

  router.post('/runFlow', function(req, res) {    
    req.on('data', (data) => {
      let jobs = JSON.parse(data.toString());  
      const flow = new EventEmitter();
      flow.on('flow-update', (state) => io.emit('flow-update', state));
      console.log(jobs);
      J.buildJobs(jobs, flow);   
      res.json({status: "OK", jobs});
    });
  });

  return router;
};