/*global require, module*/

var fs = require('fs'),
    path = require('path');

var subserverDir = './../subservers/',
    baseURL;

// -=-=-=-
// helper
// -=-=-=-

function getSubserverModules() {
    return fs.readdirSync(path.join(__dirname, subserverDir))
           .filter(function(file) { return (/\.js$/.test(file)) })
           .map(function(file) { return file.substr(0, file.lastIndexOf('.')); })
}

// -=-=-=-=-=-=-
// handler class
// -=-=-=-=-=-=-

function SubserverHandler(config) {
    config = config || {};
    baseURL = config.baseURL || '/nodejs/';
}

SubserverHandler.prototype.registerWith = function(app) {
    getSubserverModules().forEach(function(serverName) {
        var route = baseURL + serverName + '/';
        console.log('starting subserver %s on route %s', serverName, route);
        require(subserverDir + serverName)(route, app);
    })
}

// -=-=-=-
// exports
// -=-=-=-

exports.SubserverHandler = SubserverHandler;