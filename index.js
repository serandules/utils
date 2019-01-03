var log = require('logger')('utils');
var nconf = require('nconf');
var bcrypt = require('bcrypt');
var AWS = require('aws-sdk');
var Redis = require('ioredis');
var mongoose = require('mongoose');
var _ = require('lodash');
var format = require('string-template');

var env = nconf.get('ENV');

var SALT_WORK_FACTOR = 10;

var adminEmail = 'admin@serandives.com';

var users = {};

var groups = {};

var tiers = {};

var redis;

var serverUrl;

exports.none = function () {

};

exports.env = function () {
  return env;
};

exports.space = function () {
  return nconf.get('SPACE');
};

exports.root = function () {
  return 'admin@' + exports.space();
};

exports.merge = function (a, b) {
  if (a && b) {
    for (var key in b) {
      if (b.hasOwnProperty(key)) {
        a[key] = a[key] || b[key];
      }
    }
  }
  return a;
};

var config = new AWS.Config({
  apiVersion: '2006-03-01',
  accessKeyId: nconf.get('AWS_KEY'),
  secretAccessKey: nconf.get('AWS_SECRET')
});

var s3 = new AWS.S3({
  region: 'ap-southeast-1',
  apiVersion: '2006-03-01',
  accessKeyId: nconf.get('AWS_KEY'),
  secretAccessKey: nconf.get('AWS_SECRET')
});

var ses = new AWS.SES({
  region: 'eu-west-1',
  apiVersion: '2010-12-01',
  accessKeyId: nconf.get('AWS_KEY'),
  secretAccessKey: nconf.get('AWS_SECRET')
});

exports.s3 = function () {
  return s3;
};

exports.ses = function () {
  return ses;
};

exports.resolve = function (url) {
  var protocol = url.match(/.*?:\/\//g);
  if (!protocol) {
    return url;
  }
  protocol = protocol[0];
  if (protocol === 'https://' || protocol === 'http://') {
    return url;
  }
  var serverUrl = exports.serverUrl();
  var sub = protocol.replace('://', '');
  var suffix = url.substring(protocol.length);
  return format(serverUrl, {sub: sub}) + suffix;
};

exports.bucket = function (name) {
  return env === 'production' ? name : env + '.' + name;
};

exports.redis = function () {
  if (redis) {
    return redis;
  }
  redis = new Redis(nconf.get('REDIS_URI'));
  return redis;
};

exports.serverUrl = function () {
  if (serverUrl) {
    return serverUrl;
  }
  serverUrl = nconf.get('SERVER_SSL') ? 'https' : 'http';
  serverUrl += '://' + nconf.get('SERVER_HOST');
  var port = nconf.get('SERVER_PORT') || nconf.get('PORT');
  serverUrl += (port === '80' || port === '443') ? '' : ':' + port;
  return serverUrl;
};

exports.encrypt = function (value, done) {
  bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
    if (err) {
      return done(err);
    }
    bcrypt.hash(value, salt, function (err, hash) {
      if (err) {
        return done(err);
      }
      done(null, hash);
    });
  });
};

exports.compare = function (left, right, done) {
  if (!left || !right) {
    return done(null, false);
  }
  bcrypt.compare(left, right, done);
};

exports.findUser = function (email, done) {
  var user = users[email];
  if (user) {
    return done(null, user);
  }
  var Users = mongoose.model('users');
  Users.findOne({email: email}, function (err, user) {
    if (err) {
      return done(err)
    }
    users[email] = user;
    done(null, user);
  });
};

exports.findGroup = function (user, name, done) {
  var o = groups[user] || (groups[user] = {});
  var group = o[name];
  if (group) {
    return done(null, group);
  }
  var Groups = mongoose.model('groups');
  Groups.findOne({user: user, name: name}, function (err, group) {
    if (err) {
      return done(err)
    }
    o[name] = group;
    done(null, group);
  });
};

exports.group = function (name, done) {
  exports.findUser(adminEmail, function (err, user) {
    if (err) {
      return done(err);
    }
    exports.findGroup(user, name, done);
  });
};

exports.grouped = function (user, name, done) {
  exports.group(name, function (err, o) {
    if (err) {
      return done(err);
    }
    var entry = _.find(user.groups, function (group) {
      return String(group) === o.id;
    });
    done(null, !!entry);
  });
};

exports.findTier = function (user, name, done) {
  var o = tiers[user] || (tiers[user] = {});
  var tier = o[name];
  if (tier) {
    return done(null, tier);
  }
  var Tiers = mongoose.model('tiers');
  Tiers.findOne({user: user, name: name}, function (err, tier) {
    if (err) {
      return done(err)
    }
    o[name] = tier;
    done(null, tier);
  });
};

exports.tier = function (name, done) {
  exports.findUser(adminEmail, function (err, user) {
    if (err) {
      return done(err);
    }
    exports.findTier(user.id, name, done);
  });
};

exports.visibles = function (ctx, o, done) {
  if (ctx.previleged) {
    return done(null, o);
  }
  exports.group('anonymous', function (err, anon) {
    if (err) {
      return done(err);
    }
    var user = exports.json(ctx.user);
    var groups = user ? user.groups : [anon.id];
    var visibility = ctx.found ? ctx.found.visibility : o.visibility;
    var allGroups = visibility['*'].groups || [];
    var all = groups.some(function (group) {
      return allGroups.indexOf(group) !== -1
    });
    if (all) {
      return done(null, o);
    }
    var allUsers = visibility['*'].users || [];
    if (user && allUsers.indexOf(user.id) !== -1) {
      return done(null, o);
    }
    var visibles = {
      id: o.id
    };
    var fields = Object.keys(o);
    fields.forEach(function (field) {
      var allowed = visibility[field];
      if (!allowed) {
        return;
      }
      if (user && allowed.users && allowed.users.indexOf(user.id) !== -1) {
        return visibles[field] = o[field];
      }
      if (!allowed.groups) {
        return;
      }
      var can = groups.some(function (group) {
        return allowed.groups.indexOf(group) !== -1;
      });
      if (can) {
        visibles[field] = o[field];
      }
    });
    done(null, visibles);
  });
};

exports.json = function (o) {
  return o ? JSON.parse(JSON.stringify(o)) : null;
};