const request = require('request');
const EventEmitter = require('events');
const fs = require('fs');
const Config = require('../jenkins.config');

const ROOT_URL = Config.url || 'http://localhost:8080'
const API = '/api/json';
const CRUMB = '/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,":",//crumb)';
const CRUMB_HEADER = 'Jenkins-Crumb';

const CREATE = '/createItem';
const DELETE = '/doDelete';
const BUILD = '/build';
const BUILD_WITH_PARAMETERS = '/buildWithParameters';
const LAST_BUILD_STATUS = '/lastBuild';
const JOB = (name) => `/job/${name}`;

class FlowStatusEmitter extends EventEmitter {}

const JOB_INFO = "JOB_INFO";
const PARALLEL_BUILD = "PARALLEL_BUILD";
const JOB_START = "JOB_START";
const PARALLEL_JOB_START = "PARALLEL_JOB_START";
const PARALLEL_JOB_END = "PARALLEL_JOB_END";
const JOB_END = "JOB_END";
const FLOW_START = "FLOW_START";
const FLOW_END = "FLOW_END";
class JobStatus {
    constructor(type, data, status) {
        this.type = type;
        this.data = data;
        this.status = status;
    }
}
var emittedBuildIds = [];
class JenkinsService {
    
    constructor(/*{ url, username, password }*/) {
        this.url = /*url ||*/ ROOT_URL;
        this.username =  Config.username;
        this.password = Config.password;
        this.generateCrumb((crumb) => this.crumb = crumb);  
    }

    isJenkinsRunning(callback) {
        request.get(ROOT_URL)
        .auth(this.username, this.password)
        .on('response', (response) => {
            callback({ status: response.statusMessage });
        }).on('error', error => {
            if (error.code == 'ECONNREFUSED'){
                callback({ status: error.code });
            }
        })
    }

    generateCrumb(callback) {
        request.get(ROOT_URL + CRUMB)
        .auth(this.username, this.password)
        .on('data', (data) => {
            callback(data.toString().split(':')[1]);
        }).on('error', (e)=> {
            if (e.code == 'ECONNREFUSED') {
                console.log('Unable to connect to Jenkins. Trying again...');
                setTimeout(() => this.generateCrumb(callback), 1000);
            }
        });
    }
    
    createJob(name, config, callback) {   
        const sendResponse = (crumb) => {
            let res = request.post(ROOT_URL + CREATE, 
                    { 
                        qs: { name }, 
                        body: `
                            <flow-definition plugin="workflow-job@2.12.1">
                                <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.36">
                                    <script>
                                    pipeline { agent any stages { stage('Stage 1') { steps { echo 'Running step 1' } } } }
                                    </script>
                                    <sandbox>true</sandbox>
                                </definition>
                            </flow-definition>
                        `,
                        headers: { 'Jenkins-Crumb': crumb, 'Content-Type': 'application/xml' }
                    }
                )
                .auth(this.username, this.password);
                res.on('response', (response) => callback(response));
        }     
        if (!this.crumb) {
            this.generateCrumb((crumb) => {
                this.crumb = crumb;
                sendResponse(crumb);
            });
        } else {
            sendResponse(this.crumb);
        }
    }
    
    listJobs(callback) {
        request.get(ROOT_URL + API + '?tree=jobs[name,url]')
            .auth(this.username, this.password)
            .on('data', (data) => {
                let jobs = JSON.parse(data.toString()).jobs;
                callback(jobs);
            });
    }

    getJobParams(name, callback){
        this.jobInfo(name, (info) => {
            if (!info.property || !info.property[0] || !info.property[0].parameterDefinitions) callback([]);
            else {
                callback(info.property[0].parameterDefinitions);
            }
        })
    }

    jobInfo(name, callback) {
        request.get(ROOT_URL + JOB(name) + API)
            .auth(this.username, this.password)
            .on('data', (data) => {
                let info;
                try {
                    info = JSON.parse(data.toString());
                    callback(info);
                } catch(e) {
                    this.jobInfo(name, callback);
                    console.log(e);
                }
            })
    }

    jobBuildInfo(name, buildNumber, callback) {
        request.get(ROOT_URL + JOB(name) + '/' + buildNumber + API)
            .auth(this.username, this.password)
            .on('data', (data) => {
                let info;
                try {
                    info = JSON.parse(data.toString());
                    callback(info);
                } catch(e) {
                    this.jobBuildInfo(name, callback);
                    console.log(e);
                }
            })
    }

    jobBuildLogs(name, buildNumber, callback) {
        let logs;
        request.get(ROOT_URL + JOB(name) + '/' + buildNumber + '/consoleText')
            .auth(this.username, this.password)
            .on('data', (data) => {
                try {
                    logs += data.toString();
                } catch(e) {
                    this.jobBuildLogs(name, callback);
                    console.log(e);
                }
            })
            .on('end', () => callback(logs))
    }

    deleteJob(name, callback) {
        const sendResponse = (crumb) => {
            let res = request.post(ROOT_URL + JOB(name) + DELETE, 
                    { 
                        headers: { 'Jenkins-Crumb': crumb, }
                    }
                )
                .auth(this.username, this.password);
                res.on('response', (response) => callback(response));
        }     
        if (!this.crumb) {
            this.generateCrumb((crumb) => {
                this.crumb = crumb;
                sendResponse(crumb);
            });
        } else {
            sendResponse(this.crumb);
        }
    }

    buildJobWithParameters(name, parameters, callback) {
        const sendResponse = (crumb) => {
            let res = request.post(ROOT_URL + JOB(name) + BUILD_WITH_PARAMETERS, 
                    { 
                        headers: { 'Jenkins-Crumb': crumb, },
                        form: parameters
                    }
                )
                .auth(this.username, this.password);
                res.on('response', (response) => {
                    callback(response)
                });
        }  
        if (!this.crumb) {
            this.generateCrumb((crumb) => {
                this.crumb = crumb;
                sendResponse(crumb);
            });
        } else {
            sendResponse(this.crumb);
        }
    }

    buildJob(name, callback) {
        const sendResponse = (crumb) => {
            let res = request.post(ROOT_URL + JOB(name) + BUILD, 
                    { 
                        headers: { 'Jenkins-Crumb': crumb, }
                    }
                )
                .auth(this.username, this.password);
                res.on('response', (response) => callback(response));
        }     
        if (!this.crumb) {
            this.generateCrumb((crumb) => {
                this.crumb = crumb;
                sendResponse(crumb);
            });
        } else {
            sendResponse(this.crumb);
        }
    }

    buildStatus(name, callback) {
        const sendResponse = (crumb) => {
            let res = request.post(ROOT_URL + JOB(name) + LAST_BUILD_STATUS + API, 
                    { 
                        headers: { 'Jenkins-Crumb': crumb, }
                    }
                )
                .auth(this.username, this.password);
                res.on('data', (response) => callback(response));
        }     
        if (!this.crumb) {
            this.generateCrumb((crumb) => {
                this.crumb = crumb;
                sendResponse(crumb);
            });
        } else {
            sendResponse(this.crumb);
        }
    }

    buildJobAndWait(job, emitter, callback, checkInterval = 250) {
        let noop = () => {};
        let afterBuild = (response, latestBuildId) => {
            if (response.statusCode != 201) {
                // failed
            }
            
            let interval = setInterval(() => {
                this.buildStatus(job.name, (buildResponse) => {
                    let resp = {};
                    if (buildResponse.toString().indexOf('404') != -1) {
                        resp.id = -1;
                    } else {
                        resp = JSON.parse(buildResponse.toString());
                    }
                        
                    const result = resp.result;
                    const d = new Date()
                    
                    if (!result && resp.id != latestBuildId && resp.id != -1) {
                        //console.log(job.name, resp.id); // Emit build id here !
                        let exists = false;
                        for (let i = 0; i < emittedBuildIds.length; i++) {
                            if (emittedBuildIds[i].name == job.name && emittedBuildIds[i].build == resp.id) {
                                exists = true;
                                break;
                            }
                        }
                        if (!exists) {
                            emittedBuildIds.push({ name: job.name, build: resp.id });
                            emitter.emit('flow-update[' + job.flowName + ']', new JobStatus('JOB_START_INFO', { jobs: job.name, build: resp.id, i: job.i, j: job.j }, "OK"));
                        }
                    }
                    else if (!result) noop();//console.log(`[${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}] IN PROGRESS`);
                    else if (resp.id == -1 || resp.id != latestBuildId) { // Not previous build id (Current build might be in queue)
                        callback(result, resp.id);
                        clearInterval(interval);
                    }
                })
            }, checkInterval);
        };
        this.buildStatus(job.name, (previousBuildResponse) => {

            let latestBuildId;
            let previousResp;
            if (previousBuildResponse.toString().indexOf('404') != -1) latestBuildId = -1;
            else {
                console.log(previousBuildResponse.toString())
                previousResp = JSON.parse(previousBuildResponse.toString());
                latestBuildId = previousResp.id;
            }

            if (job.params == undefined || job.params == null || job.params.length == 0) {
                this.buildJob(job.name, (response) => afterBuild(response, latestBuildId));
            } else {
                // FORMAT JOB PARAMS
                let objParams = {};
                for (let param of job.params) {
                    objParams[param.name] = param.value;
                }
                this.buildJobWithParameters(job.name, objParams, (response) => afterBuild(response, latestBuildId));
            }
        });
    }
    
    isFlowRunning(flowName) {
        const data = fs.readFileSync('storage/' + flowName + '/_.json');
        return !!JSON.parse(data.toString()).isRunning;
    }

    setFlowRunning(flowName, value) {
        const data = fs.readFileSync('storage/' + flowName + '/_.json');
        const flow = JSON.parse(data.toString());
        flow.isRunning = value;
        fs.writeFileSync('storage/' + flowName + '/_.json', JSON.stringify(flow));
    }

    buildJobs(flow, emitter = new FlowStatusEmitter(), index = 0) {
        let jobs = flow.flow;
        // Set parameters into job objects

        if (!this.flowStarted) {
            emitter.emit('flow-update', new JobStatus(FLOW_START, "", "OK"));
            this.flowStarted = true;
        }
        
        if (jobs[index] instanceof Array) { // parallel jobs
            let parallelJobs = jobs[index];
            emitter.emit('flow-update', new JobStatus(JOB_INFO, { jobs: parallelJobs, index }, PARALLEL_BUILD));

            let parallelJobsStatus = [];
            jobs[index].forEach((elt) => parallelJobsStatus.push(false));
            
            for (let i = 0; i < parallelJobs.length; i++) {
                emitter.emit('flow-update', new JobStatus(PARALLEL_JOB_START, { jobs: parallelJobs[i].name, index, j: i, params: parallelJobs[i].params }, "OK"));
                this.buildJobAndWait(parallelJobs[i], (result) => {
                    emitter.emit('flow-update', new JobStatus(PARALLEL_JOB_END, { jobs: parallelJobs[i].name, index, j: i }, result));
                    
                    if (result != "SUCCESS") {
                        emitter.emit('flow-update', new JobStatus(FLOW_END, parallelJobs[i].name, result));
                        this.flowStarted = false;
                        return;
                    }

                    parallelJobsStatus[i] = true;
                    if (parallelJobsStatus.indexOf(false) == -1 && index + 1 < jobs.length) {
                        this.buildJobs(jobs, emitter, index + 1);
                    } else if (parallelJobsStatus.indexOf(false) == -1 && index + 1 == jobs.length){
                        emitter.emit('flow-update', new JobStatus(FLOW_END, "", result));
                        this.flowStarted = false;
                    }
                })
            }
        } else {
            emitter.emit('flow-update', new JobStatus(JOB_START, { jobs: jobs[index].name, index, params: jobs[index].params }, "OK"));
            this.buildJobAndWait(jobs[index], (result) => {
                emitter.emit('flow-update', new JobStatus(JOB_END, { jobs: jobs[index].name, index }, result));

                if (result != "SUCCESS") {
                    emitter.emit('flow-update', new JobStatus(FLOW_END, jobs[index].name, result));
                    this.flowStarted = false;
                    return;
                }

                if ((index + 1) == jobs.length) {
                    emitter.emit('flow-update', new JobStatus(FLOW_END, "", result));
                    this.flowStarted = false; 
                } else 
                    this.buildJobs(jobs, emitter, index + 1);
            })
        }
        
        return emitter;
    }

    buildFlow(flow, emitter = new FlowStatusEmitter(), index = 0) {
        let jobs = flow.flow;
        // Set parameters into job objects
        for (let i = 0; i < jobs.length; i++) {
            if (jobs[i] instanceof Array) {
                for (let j = 0; j < jobs[i].length; j++) {
                    if (jobs[i][j].params == undefined || jobs[i][j].params == null) continue;
                    for (let k = 0; k < jobs[i][j].params.length; k++) {
                        jobs[i][j].params[k].value = flow.parameters[jobs[i][j].params[k].name].value;
                    }
                }
            } else {
                if (jobs[i].params == undefined || jobs[i].params == null) continue;
                for (let k = 0; k < jobs[i].params.length; k++) {
                    jobs[i].params[k].value = flow.parameters[jobs[i].params[k].name].value;
                }
            }
        }
    
        if (!this.isFlowRunning(flow.name)) {
            emitter.emit('flow-update[' + flow.name + ']', new JobStatus(FLOW_START, flow.name, "OK"));
            this.setFlowRunning(flow.name, true);
        }
        
        if (jobs[index] instanceof Array) { // parallel jobs
            let parallelJobs = jobs[index];
            emitter.emit('flow-update[' + flow.name + ']', new JobStatus(JOB_INFO, { jobs: parallelJobs, index }, PARALLEL_BUILD));

            let parallelJobsStatus = [];
            jobs[index].forEach((elt) => parallelJobsStatus.push(false));
            
            for (let i = 0; i < parallelJobs.length; i++) {
                emitter.emit('flow-update[' + flow.name + ']', new JobStatus(PARALLEL_JOB_START, { jobs: parallelJobs[i].name, index, j: i, params: parallelJobs[i].params }, "OK"));
                // Save flow name and position to emit inside buildJobAndWait
                parallelJobs[i].flowName = flow.name;
                parallelJobs[i].i = index;
                parallelJobs[i].j = i;
                this.buildJobAndWait(parallelJobs[i], emitter, (result, buildId) => {
                    emitter.emit('flow-update[' + flow.name + ']', new JobStatus(PARALLEL_JOB_END, { jobs: parallelJobs[i].name, index, j: i, build: buildId }, result));
                    
                    if (result != "SUCCESS") {
                        emitter.emit('flow-update[' + flow.name + ']', new JobStatus(FLOW_END, parallelJobs[i].name, result));
                        this.setFlowRunning(flow.name, false);
                        return;
                    }

                    parallelJobsStatus[i] = true;
                    if (parallelJobsStatus.indexOf(false) == -1 && index + 1 < jobs.length) {
                        this.buildFlow(flow, emitter, index + 1);
                    } else if (parallelJobsStatus.indexOf(false) == -1 && index + 1 == jobs.length){
                        emitter.emit('flow-update[' + flow.name + ']', new JobStatus(FLOW_END, "", result));
                        this.setFlowRunning(flow.name, false);
                    }
                })
            }
        } else {
            emitter.emit('flow-update[' + flow.name + ']', new JobStatus(JOB_START, { jobs: jobs[index].name, index, params: jobs[index].params }, "OK"));
            jobs[index].flowName = flow.name;
            jobs[index].i = index;
            this.buildJobAndWait(jobs[index], emitter, (result, buildId) => {
                emitter.emit('flow-update[' + flow.name + ']', new JobStatus(JOB_END, { jobs: jobs[index].name, index, build: buildId }, result));

                if (result != "SUCCESS") {
                    emitter.emit('flow-update[' + flow.name + ']', new JobStatus(FLOW_END, jobs[index].name, result));
                    this.setFlowRunning(flow.name, false);
                    return;
                }

                if ((index + 1) == jobs.length) {
                    emitter.emit('flow-update[' + flow.name + ']', new JobStatus(FLOW_END, "", result));
                    this.setFlowRunning(flow.name, false); 
                } else 
                    this.buildFlow(flow, emitter, index + 1);
            })
        }
        
        return emitter;
    }

}

module.exports = JenkinsService;
