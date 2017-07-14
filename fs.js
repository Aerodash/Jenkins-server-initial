const JenkinsService = require('./routes/jenkins');
const J = new JenkinsService();
const EventEmitter = require('events');
//J.getJobParams('maven-build-pipeline', (params) => console.log(params));

/*
J.buildJobWithParameters('batchjob', {'STRING_PARAM': 'value'}, (response) => {
  console.log(response.statusCode, response.statusMessage);
});*/

//const flow = {"timestamp":1499933473632,"name":"Working2","flow":[{"_class":"org.jenkinsci.plugins.workflow.job.WorkflowJob","name":"Pipeline","url":"http://localhost:8080/job/Pipeline/","params":[{"_class":"hudson.model.StringParameterDefinition","defaultParameterValue":{"_class":"hudson.model.StringParameterValue","name":"A_STRING","value":""},"description":"","name":"A_STRING","type":"StringParameterDefinition","value":"aaaaa"}],"selected":true},[{"_class":"org.jenkinsci.plugins.workflow.job.WorkflowJob","name":"batchjob","url":"http://localhost:8080/job/batchjob/","params":[{"_class":"hudson.model.StringParameterDefinition","defaultParameterValue":{"_class":"hudson.model.StringParameterValue","name":"STRING_PARAM","value":"DEFAULT_VALUE"},"description":"","name":"STRING_PARAM","type":"StringParameterDefinition","value":"ddd"},{"_class":"hudson.model.TextParameterDefinition","defaultParameterValue":{"_class":"hudson.model.StringParameterValue","name":"TEXT_PARAM","value":"DEFAULT_VALUE"},"description":"","name":"TEXT_PARAM","type":"TextParameterDefinition","value":"ccc"},{"_class":"hudson.model.PasswordParameterDefinition","defaultParameterValue":{"_class":"hudson.model.PasswordParameterValue","name":"PASS_PARAM"},"description":"","name":"PASS_PARAM","type":"PasswordParameterDefinition","value":"aaa"},{"_class":"hudson.model.BooleanParameterDefinition","defaultParameterValue":{"_class":"hudson.model.BooleanParameterValue","name":"BOOLEAN_PARAM","value":true},"description":"","name":"BOOLEAN_PARAM","type":"BooleanParameterDefinition","value":true},{"_class":"hudson.model.ChoiceParameterDefinition","defaultParameterValue":{"_class":"hudson.model.StringParameterValue","name":"CHOICE_PARAM","value":"Choice 1"},"description":"","name":"CHOICE_PARAM","type":"ChoiceParameterDefinition","choices":["Choice 1","Choice 2","Choice 3","Choice 4"],"value":"Choice 2"}],"selected":true},{"_class":"org.jenkinsci.plugins.workflow.job.WorkflowJob","name":"Pipeline","url":"http://localhost:8080/job/Pipeline/","params":[{"_class":"hudson.model.StringParameterDefinition","defaultParameterValue":{"_class":"hudson.model.StringParameterValue","name":"A_STRING","value":""},"description":"","name":"A_STRING","type":"StringParameterDefinition","value":"bbbbbbb"}],"selected":true}],{"_class":"org.jenkinsci.plugins.workflow.job.WorkflowJob","name":"maven-build-pipeline","url":"http://localhost:8080/job/maven-build-pipeline/","params":[],"selected":true},{"_class":"org.jenkinsci.plugins.workflow.job.WorkflowJob","name":"Pipeline","url":"http://localhost:8080/job/Pipeline/","params":[{"_class":"hudson.model.StringParameterDefinition","defaultParameterValue":{"_class":"hudson.model.StringParameterValue","name":"A_STRING","value":""},"description":"","name":"A_STRING","type":"StringParameterDefinition","value":"nnnnnnn"}],"selected":true}]};
const flowEmitter = new EventEmitter();
flowEmitter.on('flow-update', (state) => console.log(state));
const job = {
  "_class": "org.jenkinsci.plugins.workflow.job.WorkflowJob",
  "name": "batchjob",
  "url": "http://localhost:8080/job/batchjob/",
  "params": [{
      "_class": "hudson.model.StringParameterDefinition",
      "defaultParameterValue": {
          "_class": "hudson.model.StringParameterValue",
          "name": "STRING_PARAM",
          "value": "DEFAULT_VALUE"
      },
      "description": "",
      "name": "STRING_PARAM",
      "type": "StringParameterDefinition",
      "value": "batchjob string param"
  }, {
      "_class": "hudson.model.TextParameterDefinition",
      "defaultParameterValue": {
          "_class": "hudson.model.StringParameterValue",
          "name": "TEXT_PARAM",
          "value": ""
      },
      "description": "",
      "name": "TEXT_PARAM",
      "type": "TextParameterDefinition",
      "value": "batchjob text param"
  }, {
      "_class": "hudson.model.PasswordParameterDefinition",
      "defaultParameterValue": {
          "_class": "hudson.model.PasswordParameterValue",
          "name": "PASS_PARAM"
      },
      "description": "",
      "name": "PASS_PARAM",
      "type": "PasswordParameterDefinition",
      "value": "batchjobpassparam"
  }, {
      "_class": "hudson.model.BooleanParameterDefinition",
      "defaultParameterValue": {
          "_class": "hudson.model.BooleanParameterValue",
          "name": "BOOLEAN_PARAM",
          "value": true
      },
      "description": "",
      "name": "BOOLEAN_PARAM",
      "type": "BooleanParameterDefinition",
      "value": true
  }, {
      "_class": "hudson.model.ChoiceParameterDefinition",
      "defaultParameterValue": {
          "_class": "hudson.model.StringParameterValue",
          "name": "CHOICE_PARAM",
          "value": "Choice 1"
      },
      "description": "",
      "name": "CHOICE_PARAM",
      "type": "ChoiceParameterDefinition",
      "choices": ["Choice 1", "Choice 2", "Choice 3", "Choice 4"],
      "value": "Choice 2"
  }],
  "selected": true,
  "status": "PROGRESS"
};

let objParams = {};
for (let param of job.params) {
    objParams[param.name] = param.value;
}
const ROOT_URL = 'http://localhost:8080'
const BUILD_WITH_PARAMETERS = '/buildWithParameters';
const JOB = (name) => `/job/${name}`;
const request = require('request');
const name =  job.name;
const parameters = objParams;
const sendResponse = (crumb) => {
  console.log('Sending response');
    let res = request.post(ROOT_URL + JOB(name) + BUILD_WITH_PARAMETERS, 
        { 
            headers: { 'Jenkins-Crumb': crumb, },
            form: parameters
        }
    )
    .auth("ahmedmoalla", "98578652");
    console.log('Response on');
    res.on('response', (response) => {
        console.log(response.statusCode, response.statusMessage)
    });
}  
if (!J.crumb) {
    J.generateCrumb((crumb) => {
        J.crumb = crumb;
        sendResponse(crumb);
    });
} else {
    sendResponse(J.crumb);
}


