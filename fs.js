const JenkinsService = require('./routes/jenkins');
const fs = require('fs');
const J = new JenkinsService();
const EventEmitter = require('events');
let data = fs.readFileSync('storage/Working2.json');
let flow = JSON.parse(data.toString());

emitter = new EventEmitter();
emitter.on('flow-update', (data) => console.log(data));
J.buildFlow(flow, emitter);