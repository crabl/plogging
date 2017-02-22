////////////////////////////////////////////////////////
// Intro                                              //
////////////////////////////////////////////////////////

const bunyan = require('bunyan');
const log = bunyan.createLogger({
  src: true,
  name: 'life',
  streams: [{
    type: 'rotating-file',
    path: './log',
    count: 100
  }, {
    stream: process.stdout
  }]
});

log.level(bunyan.INFO);

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser());
//app.use(bodyParser.urlencoded({extended: true}));

const uuidGen = require('node-uuid');

const sugar = require('sugar');

////////////////////////////////////////////////////////
// Mod                                                //
////////////////////////////////////////////////////////

// Modifier of any sort.  Usually an adpositional phrase.
class Mod {
  constructor(tag, value) {
    // A tag, usually a preposition, for this modifier.
    //
    // Always a string.  The null string is interpreted to
    // mean "direct object".
    this.tag = tag;

    // The value of the modifier.  Can be rich content.
    this.value = value;
  }

  toString() {
    let tag = this.tag;

    if (this.tag) {
      tag += ' ';
    }

    return tag + this.value.toString();
  }

  toJson() {
    return {
      tag: this.tag,
      value: this.value
    };
  }

  toHtml() {
    return this.toString();
  }
}

// Factory method to load a mod from json
function loadMod(json) {
  return new Mod(json.tag, json.value);
}

////////////////////////////////////////////////////////
// Fact                                               //
////////////////////////////////////////////////////////

// Factory method to load a fact from json.
function loadFact(json) {
  return new Fact(json.subject, json.verb, json.mods.map(loadMod), json.uuid);
}

class Fact {
  constructor(subject, verb, mods, uuid=uuidGen.v4()) {
    this.verb = verb;
    this.subject = subject;
    this.mods = mods;
    this.uuid = uuid;
  }

  toString() {
    var modString = this.mods.length === 0 ? '' : ' ' + this.mods.map(function(mod) {
      return mod.toString();
    }).join(' ');

    return this.subject + ' ' + this.verb + modString + '.';
  }

  toJson() {
    return {
      subject: this.subject,
      verb:    this.verb,
      mods:    this.mods.map(function(mod) { return mod.toJson(); }),
      uuid:    this.uuid
    };
  }

  deleteHtml() {
    return '' +
      '<form action="/delete" method="POST" class="delete-form">\n' +
      '<input class="delete-uuid" type="hidden" name="uuid" value="' + this.uuid + '" />\n' +
      '<input class="delete-button" type="submit" value="X" />\n' +
      '</form>'
  }

  toHtml() {
    return '<li>' + this.deleteHtml() + this.toString() + '</li>\n';
  }
}

////////////////////////////////////////////////////////
// Facts                                              //
////////////////////////////////////////////////////////

// Factory method to load facts from json
function loadFacts(json) {
  return new Facts(json.map(loadFact));
}

class Facts {
  constructor(facts=[]) {
    this.facts = facts;
  }

  push(subject, verb, mods) {
    this.facts.push(new Fact(subject, verb, mods));
  }

  remove(uuid) {
    var index = this.facts.findIndex(function(fact, index, facts) {
      return uuid == fact.uuid;
    });

    if ( index >= 0 ) {
      this.facts.splice(index, 1);
    }
  }

  toString() {
    return this.facts.join('\n');
  }

  toJson() {
    return this.facts.map(function(fact) {
             return fact.toJson();
           });
  }

  toHtml() {
    var elems = this.facts.map(function(fact) {
      return fact.toHtml();
    });
    return '<ul>\n' + elems.join('') + '</ul>\n';
  }
}

////////////////////////////////////////////////////////
// persistence                                        //
////////////////////////////////////////////////////////

var storeFile = './store';
var fs = require('fs');

// loads the fact store from storeFile, and passes the
// Facts object to the callback cb.  async.
function loadStore(cb) {
  fs.readFile(storeFile, function(err, data) {
    if ( err ) {
      log.warn(err, 'no fact store in ' + storeFile);
      cb(new Facts());
    }
    else {
      cb(loadFacts(JSON.parse(data.toString())));
    }
  });
}

// writes the fact store to disk.  async.
function writeStore(facts, cb) {
  fs.writeFile(storeFile, JSON.stringify(facts.toJson()), function(err) {
    if ( err ) {
      log.error(err, 'couldn\'t save fact store');
      cb();
    }
    else {
      log.info('fact store saved to ' + storeFile);
      cb();
    }
  });
}

////////////////////////////////////////////////////////
// main html                                          //
////////////////////////////////////////////////////////

function mainHtml(facts) {
  return '' +
    '<html>\n' +
    '<head>\n' +
    '<meta name="viewport" content="width=device-width" />\n' +
    '<script src="/jquery-3.1.0.js"></script>\n' +
    '<script src="/main.js"></script>\n' +
    '<link rel="stylesheet" type="text/css" href="main.css" />\n' +
    '</head>\n' +
    '<body>\n' +
    '<p>Hallo!</p>\n' +
    addFactoidHtml() +
    '<p>Here\'s your life story up \'till now:</p>\n' +
    facts.toHtml() +
    '</body>\n' +
    '</html>\n';
}

function addFactoidHtml() {
  return '' +
    '<form id="add-form" action="/" method="POST">\n' +
    '<input class="add-line" id="subject" type="text" name="subject" placeholder="our hero" required autocapitalize="none"/>\n' +
    '<input class="add-line" id="verb" type="text" name="verb" placeholder="awoke" required autocapitalize="none" />\n' +
    '<br />\n' +
    '<div id="mods"></div>\n' +
    '<input class="add-line" id="add" type="submit" value="Add" />\n' +
    '</form>\n'
}

function mainJson(facts) {
  return facts.toJson();
}

////////////////////////////////////////////////////////
// transform                                          //
////////////////////////////////////////////////////////

function transform(value) {
  var date = new sugar.Date(value);
  log.info(date.isValid());
  if ( date.isValid().raw ) {
    log.info(true);
    return date.full().raw;
  }
  else {
    log.info(false);
    return value;
  }
}

////////////////////////////////////////////////////////
// main                                               //
////////////////////////////////////////////////////////

function main() {
  loadStore(function(facts) {
    log.info('loaded facts', facts.toString());

    app.get('/', function(req, res) {
      res.send(mainHtml(facts));
    });

    app.get('/state', function(req, res) {
      res.send(JSON.stringify(mainJson(facts)));
    });

    app.post('/add', function(req, res) {
      facts.push(req.body.subject, req.body.verb, (req.body.mods ? req.body.mods : []).map(loadMod));

      // there's obviously a race condition here, if
      // another request comes in while we're writing
      // to the file.  we should queue up requests that
      // come in while we're writing.  better yet, we
      // should use an actual database or something.

      writeStore(facts, function() {
        res.send(JSON.stringify({ok: true}));
      });
    });

    app.post('/delete', function(req, res) {
      log.info(req.body);
      facts.remove(req.body.uuid);

      // see /add for race condition disclaimer

      writeStore(facts, function() {
        res.send(JSON.stringify({ok: true}));
      });
    });

    app.post('/transform', function(req, res) {
      log.info('tranforming ' + req.body.id + ':  ' + req.body.value);

      res.send(JSON.stringify({id: req.body.id, value: transform(req.body.value)}));
    });

    app.use(express.static('public'));

    app.listen(3000, function() {
      log.info('beep... beep...');
    });
  });
};

main();
