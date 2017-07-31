const JenkinsService = require('./routes/jenkins');
const fs = require('fs');
const J = new JenkinsService();
const EventEmitter = require('events');
const io = require('socket.io-client');
/*
const socket = io('http://localhost:3000')
socket.on('flow-update[Working2]', (flowStatus) => console.log(flowStatus));*/
/*
const flow = JSON.parse(fs.readFileSync('storage/Working2.json'));
J.buildFlow(flow);*/


J.isJenkinsRunning((running) => {
    console.log(running);
});
