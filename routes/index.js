const express = require('express');
const EventEmitter = require('events');
const fs = require('fs');
const router = express.Router();
const uniqBy = require('lodash.uniqby');
const Config = require('../jenkins.config');

module.exports = function(io) {

  const JenkinsService = require('./jenkins');
  const J = new JenkinsService();

  router.get('/', function(req, res) {
    res.json({hello: 'There'});
  });
  // GET /jobs OR /jobs?params=true
  router.get('/jobs', getJobs);
  router.get('/jobs/:jobName/build/:buildNumber', getJobBuildDetails);
  router.get('/jobs/:jobName/build/:buildNumber/logs', getJobBuildLogs);
  // GET /jobParams?name=?
  router.get('/jobParams', getJobParams);
  // POST /saveFlow?name=?
  router.post('/saveFlow', postSaveFlow);
  router.get('/flowExists', flowExists);
  router.get('/flows', getFlows);
  router.get('/flows/:flowName', getFlow);
  router.get('/flows/:flowName/params', fetchFlowParams)
  router.post('/runFlow', runFlow);
  router.post('/stopFlow', stopFlow);
  router.get('/flows/:flowName/stats', getStats);
  // GET page=?&n=?&reverse = ?
  router.get('/flows/:flowName/builds', getBuilds)
  // GET n=?
  router.get('/flows/:flowName/builds/latest', getLatestBuilds)
  router.get('/flows/:flowName/builds/:buildNumber', getBuild)
  router.get('/info', getJenkinsUrl);
  router.get('/running', isJenkinsRunning);

  function isJenkinsRunning(req, res) {
    J.isJenkinsRunning((running) => {
        res.json(running);
    });
  }

  function getJenkinsUrl(req, res) {
    res.json({ url: Config.url, username: Config.username });
  }

  function getJobBuildLogs(req, res) {
    const jobName = req.params.jobName;
    const buildNumber = req.params.buildNumber;
    J.jobBuildLogs(jobName, buildNumber, (logs) => {
      res.send(logs);
    })
  }

  function getJobBuildDetails(req, res) {
    const jobName = req.params.jobName;
    const buildNumber = req.params.buildNumber;

    J.jobBuildInfo(jobName, buildNumber, (info) => {
      res.json(info);
    })
  }
 
  function getBuilds(req, res) {
    const flowName = req.params.flowName;
    const nbPerPage = parseInt(req.query.n);
    const page = parseInt(req.query.page);
    const builds = fs.readdirSync('storage/' + flowName + '/builds');

    if (req.query.reverse) builds.reverse();

    const resBuilds = [];
    if (page == undefined || page == null || isNaN(page)) {
      for (let i = 0; i < builds.length; i++) {
        let build = fs.readFileSync('storage/' + flowName + '/builds/' + builds[i]);
        resBuilds.push(JSON.parse(build.toString()));
      }
    } else {
      for (let i = nbPerPage * page; i <= Math.min((nbPerPage * page) + nbPerPage - 1, builds.length - 1); i++) {
        let build = fs.readFileSync('storage/' + flowName + '/builds/' + builds[i]);
        resBuilds.push(JSON.parse(build.toString()));
      }

    }

    res.json({ nbPages: Math.ceil(builds.length / nbPerPage) - 1, builds: resBuilds });
  }

  function getBuild(req, res) {
    const flowName = req.params.flowName;
    const buildNumber = req.params.buildNumber;
    let build = {};
    try {
      build = JSON.parse(fs.readFileSync('storage/' + flowName + '/builds/#' + buildNumber + '.json'));
      res.json(build);
    
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log(e.message);
        res.json({'error': 'NOT_FOUND'});
      }
    }
  }

  // 
  function getLatestBuilds(req, res) {
    const nbBuilds = parseInt(req.query.n);
    const flowName = req.params.flowName;
    const builds = fs.readdirSync('storage/' + flowName + '/builds');

    let latestBuilds = [];
    for (let i = builds.length - 1; i >= builds.length - nbBuilds; i--) {
       const build = fs.readFileSync('storage/' + flowName + '/builds/' + builds[i]);
       latestBuilds.push(JSON.parse(build.toString()));
    }
    res.json(latestBuilds);
  }

  function getStats(req, res) {
    const flowName = req.params.flowName;
    let latestFiveBuilds = [];
    let nbSuccessfulBuilds = 0;
    let nbFailedBuilds = 0;
    let execDurations = [];
    let latestSuccessfulBuild, latestFailedBuild;

    const nbLatestBuilds = 5;
    const BUILD_DIR = 'storage/' + flowName + '/builds';

    const builds = fs.readdirSync(BUILD_DIR);

    const jobsMap = new Map(); // (jobName) => ({nbFailure, nbSuccess})

    for (let i = 0; i < builds.length; i++) {
        const build = JSON.parse(fs.readFileSync(BUILD_DIR + '/' + builds[i]).toString());
        if (i >= builds.length - nbLatestBuilds) {
            latestFiveBuilds.push(build);
        }

        if (build.status === 'SUCCESS') {
            latestSuccessfulBuild = build.buildId;
            nbSuccessfulBuilds++;
        } else {
            latestFailedBuild = build.buildId;
            nbFailedBuilds++;
        }
        execDurations.push(build.duration);

        
        for (let j = 0; j < build._.flow.length; j++) {
            const job = build._.flow[j];
            if (job instanceof Array) {
                for (let k = 0; k < job.length; k++) {
                    let oldNbSuccess = 0;
                    let oldNbFailures = 0;
                    if (jobsMap.has(job[k].name)) {
                        let nbs = jobsMap.get(job[k].name);
                        oldNbSuccess = nbs.nbSuccess;
                        oldNbFailures = nbs.nbFailure;
                    }
                    if (job[k].status == 'SUCCESS') {

                        jobsMap.set(job[k].name, { nbSuccess: oldNbSuccess + 1, nbFailure: oldNbFailures })
                    } else if (job[k].status != null) {
                        jobsMap.set(job[k].name, { nbSuccess: oldNbSuccess, nbFailure: oldNbFailures + 1 })
                    }
                }
            } else {
                let oldNbSuccess = 0;
                let oldNbFailures = 0;
                if (jobsMap.has(job.name)) {
                    let nbs = jobsMap.get(job.name);
                    oldNbSuccess = nbs.nbSuccess;
                    oldNbFailures = nbs.nbFailure;
                }
                if (job.status == 'SUCCESS') {

                    jobsMap.set(job.name, { nbSuccess: oldNbSuccess + 1, nbFailure: oldNbFailures })
                } else if (job.status != null) {
                    jobsMap.set(job.name, { nbSuccess: oldNbSuccess, nbFailure: oldNbFailures + 1 })
                }
            }
        }
        
    }

    let s = 0, f = 0;
    let mostSuccessfulJob, mostFailingJob;
    jobsMap.forEach((v, k) => {
        if (v.nbSuccess >= s) {
            s = v.nbSuccess
            mostSuccessfulJob = k;
        }
        if (v.nbFailure >= f) {
            f = v.nbFailure;
            mostFailingJob = k;
        }
    })

    let stats = {
        name: flowName,
        latestFiveBuilds,
        nbSuccessfulBuilds,
        nbFailedBuilds,
        latestSuccessfulBuild,
        latestFailedBuild,
        execDurations,
        mostSuccessfulJob,
        mostFailingJob
    }

    res.json(stats);
  }

  function stopFlow(req, req) {

  }

  function getJobs(req, res) {
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
      
  }

  function getJobParams(req, res) {
    J.getJobParams(req.query.name, (params) => res.json(params));
  }


  function saveFlow(flowName, flow) {
    const timestamp = new Date().getTime();
    console.log(flow);
    if (flow.flow != undefined && flow.flow != null) {
      // Clear status attribute
      for (let i = 0; i < flow.flow.length; i++) {
        if (flow.flow[i] instanceof Array) {
          for (let j = 0; j < flow.flow[i].length; j++) {
            flow.flow[i][j].status = null;
          }
        } else {
          flow.flow[i].status = null;
        }
      }
    }
    
    const file = {
      timestamp,
      name: flowName,
      parameters: flow.parameters || {},
      flow: flow.flow || [],
      isRunning: flow.isRunning || false
    }
   
    const dirExists = fs.existsSync('storage/' + flowName);
    if (!dirExists)
      fs.mkdirSync('storage/' + flowName);

    fs.writeFileSync('storage/' + flowName + '/_.json', JSON.stringify(file));
    return file;
  }

  function postSaveFlow(req, res) {
    req.on('data', (data) => {
      const flow = JSON.parse(data.toString());
      saveFlow(req.query.name, flow);
      res.json({ name: req.query.name });
    });
  }

  function flowExists(req, res) {
    fs.readdir('storage', (err, files) => {
      if (err) console.error(err);
      for (let i = 0; i < files.length; i++) {
        if (files[i] === req.query.name) {
          res.json({ name: req.query.name, exists: true })
          return;
        }
      }
      res.json({ name: req.query.name, exists: false })
    })
  }

  function getFlows(req, res) {
    fs.readdir('storage', (err, files) => {
      if (err) console.error(err);
      let result = [];
      files.forEach((file, index) => {
        const data = fs.readFileSync('storage/' + file + '/_.json');
        result.push(JSON.parse(data.toString()));
        if (index === files.length - 1) res.json(result);
      });
    })
  }

  function getFlow(req, res) {
    let data;
    try {
      data = fs.readFileSync('storage/' + req.params.flowName + '/_.json');
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
        if (maxCount == 0) {
          cb();
          return;
        }

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
  }

  function getFlowParams(flowName) {
    let data;
    try {
      data = fs.readFileSync('storage/' + flowName + '/_.json');
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log(e.message);
        res.json({'error': 'NOT_FOUND'});
        return;
      } 
    }
    const flow = JSON.parse(data.toString());
    let jobs = [].concat(flow.flow);
    
    if (!jobs || jobs == undefined || jobs == null || jobs.length === 0) return {};
  
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
                .reduce(flatten, [])
                .filter((job) => job.params !== undefined && job.params.length > 0)
                .map((job) => job.params)
                .reduce(flatten, []);
    params = uniqBy(params, 'name');
    let paramsMap = {};
    params.forEach((p) => {
        let obj = { type: p.type }
        if (p.choices) obj['choices'] = p.choices;
        paramsMap[p.name] = obj;
    })

    // Get value of param if it was previously saved
    for (let paramName of Object.keys(flow.parameters)) {
      if (flow.parameters[paramName].value) paramsMap[paramName]['value'] = flow.parameters[paramName].value;
    }

    return paramsMap;
  }

  function fetchFlowParams(req, res) {
    const paramsMap = getFlowParams(req.params.flowName);
    res.json(paramsMap);
  }

  function setJobAsRunningForFlow(flowName, jobName, jobBuildNumber, isRunning) {
    if (!fs.existsSync('storage/' + flowName + '/running.json')) {
      fs.writeFileSync('storage/' + flowName + '/running.json', JSON.stringify([]));
    }

    const data = fs.readFileSync('storage/' + flowName + '/_.json');
    const runningJobs = JSON.parse(data.toString());

    if (isRunning) {
      runningJobs.push({ name: jobName, build: jobBuildNumber });
    } else { // Remove from the running jobs array
      for (let i = 0; i < runningJobs.length; i++) {
        if (runningJobs[i].name == jobName && runningJobs[i].build == jobBuildNumber) {
          runningJobs.splice(i, 1);
          break;
        }
      }
    }
    
    fs.writeFileSync('storage/' + flowName + '/running.json', JSON.stringify(runningJobs));
  }

  function runFlow(req, res) {    
    req.on('data', (data) => {
      let flow = JSON.parse(data.toString());  
      if (J.isFlowRunning(flow.name)) {
        res.json({ error: 'FLOW_ALREADY_RUNNING' });
        return;
      }
      const flowEmitter = new EventEmitter();
      

      if (!fs.existsSync('storage/' + flow.name + '/builds')) fs.mkdirSync('storage/' + flow.name + '/builds');
      const files = fs.readdirSync('storage/' + flow.name + '/builds');
      const buildId = files.length + 1;
      const buildFile = {
        buildId  
      };

      flowEmitter.on('flow-update[' + flow.name + ']', (state) => {
        
        switch(state.type) {
          case 'JOB_START':
          case 'PARALLEL_JOB_START':
            //setJobAsRunningForFlow(flow.name, state.data.jobs, 0, true);
          break;
          case 'JOB_END':
          case 'PARALLEL_JOB_END':
            //setJobAsRunningForFlow(flow.name, state.data.jobs, 0, false);
            // Set job status
            if (state.data.index != undefined && state.data.j == undefined){
              flow.flow[state.data.index].status = state.status;
            } else if (state.data.index != undefined && state.data.j != undefined) {
              flow.flow[state.data.index][state.data.j].status = state.status;
            }
          break;
          case 'FLOW_START':
            buildFile['timestamp'] = new Date().getTime();
          break;
          case 'FLOW_END':
            buildFile['status'] = state.status;
            buildFile['duration'] = new Date().getTime() - buildFile['timestamp'];
            buildFile['_'] = flow;
            fs.writeFile('storage/' + flow.name + '/builds/#' + buildId + '.json', JSON.stringify(buildFile));
          break;
          case 'JOB_START_INFO':
            if (!buildFile['jobBuilds']) buildFile['jobBuilds'] = [];
            if (state.data.i != undefined && state.data.j == undefined) {
              buildFile['jobBuilds'][state.data.i] = parseInt(state.data.build);
            } else if (state.data.i != undefined && state.data.j != undefined){
              if (!buildFile['jobBuilds'][state.data.i]) buildFile['jobBuilds'][state.data.i] = [];
              buildFile['jobBuilds'][state.data.i][state.data.j] = parseInt(state.data.build);
            }
            
          break;
        }
        io.emit('flow-update[' + flow.name + ']', state)
      });
      J.buildFlow(flow, flowEmitter);   
      res.json({status: "OK"});
    });
  }

  return router;
};