var io = require('socket.io-client');
var chokidar = require('chokidar');
var fs = require('fs');
var path = require('path');
var addedFiles = {};
var block = 524288;

var watcher = chokidar.watch('./files', {
  ignored: /[\/\\]\./,
  persistent: true
});

watcher.on('add', function(file, stats) {
  console.log('Comprobando el fichero [' + file + ']');
  
  fs.stat(file, function(err, stat) {
    if (err) {
      return console.log(err);
    }
    
    setTimeout(checkFile, 10000, file, stat);
  });
});

function startUpload(name) {
  console.log('Subiendo el fichero [' + addedFiles[name].path + ']');
  socket.emit('start', { name: name, id: addedFiles[name].id, size: addedFiles[name].stat.size });
}

function checkFile(file, prev) {
  fs.stat(file, function(err, stat) {
    if (err) {
      return console.log(err);
    }
    
    if (stat.mtime.getTime() === prev.mtime.getTime()) {
      var id = uuid();
      var name = path.basename(file);
  
      addedFiles[name] = {
        id: id,
        stat: stat,
        name: name,
        path: file
      };
      
      startUpload(name);
    } else {
      setTimeout(checkFile, 10000, file, stat);
    }
  });
}

var socket = io.connect('http://localhost:3000', {
  'reconnect': true,
  'reconnection delay': 500,
  'max reconnection attempts': 10
});

socket.on('moreData', function (data) {
  var name = data['name'];
  
  console.log('Enviando parte del fichero [' + addedFiles[name].path + ']');
  
  fs.open(addedFiles[name].path, 'r', function(err, fd) {
    if (err) {
      return console.log(err);
    }
    
    var place = data['place'] * block; //The Next Blocks Starting Position
    var len = place + block > addedFiles[name].stat.size ? addedFiles[name].stat.size - place : block;
    var buffer = new Buffer(len); //The Variable that will hold the new Block of Data
    
    fs.read(fd, buffer, 0, len, place, function(err, bytesRead, bufferRead) {
      socket.emit('upload', { name: name, id: addedFiles[name].id, data: bufferRead });
      fs.close(fd);
    });
  });
});

socket.on('alreadyExists', function(data) {
  var name = data['name'];
  var path = addedFiles[name].path;
  
  console.log('El fichero [' + path + '] ya existe en el servidor');
  
  fs.unlink(path, function() {
    console.log('El fichero [' + path + '] se ha eliminado');
  });
  
  delete addedFiles[name];
});

socket.on('done', function (data) {
  var name = data['name'];
  
  console.log('El fichero [' + addedFiles[name].path + '] se ha cargado correctamente');
  
  fs.unlink(path, function() {
    console.log('El fichero [' + path + '] se ha eliminado');
  });
  
  delete addedFiles[name];
});

socket.on('connect', function(data) {
  console.log('Conectado al servidor');
  
  if (Object.keys(addedFiles).length > 0) {
    for (var name in addedFiles) {
      startUpload(name);
    }
  }
});

socket.on('disconnect', function(data) {
  console.log('Desconectado del servidor');
});

function uuid(a)  {
  return a ? (a^Math.random()*16>>a/4).toString(16) : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,uuid);
}