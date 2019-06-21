var log = require('logger')('utils');
var nconf = require('nconf');
var bcrypt = require('bcrypt');
var async = require('async');
var AWS = require('aws-sdk');
var Redis = require('ioredis');
var errors = require('errors');
var mongoose = require('mongoose');
var _ = require('lodash');
var format = require('string-template');

var env = nconf.get('ENV');

var SALT_WORK_FACTOR = 10;

var adminEmail = 'admin@serandives.com';

var users = {};

var groups = {};

var workflows = {};

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

exports.findWorkflow = function (user, name, done) {
  var o = workflows[user] || (workflows[user] = {});
  var workflow = o[name];
  if (workflow) {
    return done(null, workflow);
  }
  var Workflows = mongoose.model('workflows');
  Workflows.findOne({user: user, name: name}, function (err, workflow) {
    if (err) {
      return done(err)
    }
    o[name] = workflow;
    done(null, workflow);
  });
};

exports.workflow = function (name, done) {
  exports.findUser(adminEmail, function (err, user) {
    if (err) {
      return done(err);
    }
    exports.findWorkflow(user, name, done);
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
    var restricted = {
      id: o.id
    };
    var user = exports.json(ctx.user);
    var groups = user ? user.groups : [anon.id];
    var visibility = ctx.found ? ctx.found.visibility : o.visibility;
    if (!visibility) {
      return restricted;
    }
    var unbound = visibility['*'] || {};
    var allGroups = unbound.groups || [];
    var all = groups.some(function (group) {
      return allGroups.indexOf(group) !== -1
    });
    if (all) {
      return done(null, o);
    }
    var allUsers = unbound.users || [];
    if (user && allUsers.indexOf(user.id) !== -1) {
      return done(null, o);
    }
    var fields = Object.keys(o);
    fields.forEach(function (field) {
      var allowed = visibility[field];
      if (!allowed) {
        return;
      }
      if (user && allowed.users && allowed.users.indexOf(user.id) !== -1) {
        return restricted[field] = o[field];
      }
      if (!allowed.groups) {
        return;
      }
      var can = groups.some(function (group) {
        return allowed.groups.indexOf(group) !== -1;
      });
      if (can) {
        restricted[field] = o[field];
      }
    });
    done(null, restricted);
  });
};

exports.json = function (o) {
  return o ? JSON.parse(JSON.stringify(o)) : null;
};

exports.permit = function (o, type, id, actions) {
  actions = Array.isArray(actions) ? actions : [actions];
  var permissions = o.permissions || [];
  var found = permissions.some(function (entry) {
    if (entry[type] !== id) {
      return false;
    }
    var actionz = entry.actions;
    entry.actions = _.union(actionz, actions);
    return true;
  });
  if (found) {
    return o;
  }
  var entry = {
    actions: actions
  };
  entry[type] = id;
  permissions.push(entry);
  return o;
};

exports.permitted = function (user, o, action) {
  var groups = user.groups;
  var permissions = o.permissions || [];
  var allowed = {
    groups: [],
    users: []
  };
  permissions.forEach(function (perm) {
    var actions = perm.actions || [];
    if (actions.indexOf(action) === -1 && actions.indexOf('*') === -1) {
      return;
    }
    if (perm.group) {
      return allowed.groups.push(perm.group);
    }
    if (perm.user) {
      return allowed.users.push(perm.user);
    }
  });
  if (allowed.users.indexOf(user.id) !== -1) {
    return true;
  }
  var i;
  var group;
  var length = groups.length;
  for (i = 0; i < length; i++) {
    group = groups[i];
    if (allowed.groups.indexOf(group) !== -1) {
      return true;
    }
  }
  return false;
};

exports.deny = function (o, type, id, actions) {
  actions = Array.isArray(actions) ? actions : [actions];
  var permissions = o.permissions || [];
  permissions.some(function (entry) {
    if (entry[type] !== id) {
      return false;
    }
    var actionz = entry.actions;
    entry.actions = _.difference(actionz, actions);
    return true;
  });
  return o;
};

exports.visible = function (o, type, id, fields) {
  fields = Array.isArray(fields) ? fields : [fields];
  fields.forEach(function (field) {
    var visibility = o.visibility || {};
    var entry = visibility[field] || (visibility[field] = {});
    var values = entry[type] || (entry[type] = []);
    entry[type] = _.union(values, [id]);
  });
  return o;
};

exports.invisible = function (o, type, id, fields) {
  fields = Array.isArray(fields) ? fields : [fields];
  fields.forEach(function (field) {
    var visibility = o.visibility;
    if (!visibility) {
      return;
    }
    var entry = visibility[field];
    if (!entry) {
      return;
    }
    var values = entry[type];
    if (!values) {
      return;
    }
    entry[type] = _.difference(values, [id]);
  });
  return o;
};

exports.toPermissions = function (user, permit, done) {
  var permissions = [];
  var groups = permit.groups;
  async.each(Object.keys(groups), function (name, eachLimit) {
    var actions = groups[name].actions;
    exports.group(name, function (err, group) {
      if (err) {
        return eachLimit(err);
      }
      permissions.push({
        group: group.id,
        actions: actions
      });
      eachLimit();
    });
  }, function (err) {
    if (err) {
      return done(err);
    }
    if (!user) {
      return done(null, permissions);
    }
    permissions.push({
      user: user,
      actions: permit.user.actions
    });
    done(null, permissions);
  });
};

exports.toVisibility = function (user, permit, done) {
  var visibility = {};
  var add = function (type, id, fields) {
    fields.forEach(function (field) {
      var entry = visibility[field] || (visibility[field] = {
        users: [],
        groups: []
      });
      entry[type].push(id);
    });
  };
  var groups = permit.groups;
  async.each(Object.keys(groups), function (name, eachLimit) {
    var visibles = groups[name].visibility;
    exports.group(name, function (err, group) {
      if (err) {
        return eachLimit(err);
      }
      add('groups', group.id, visibles);
      eachLimit();
    });
  }, function (err) {
    if (err) {
      return done(err);
    }
    if (!user) {
      return done(null, visibility);
    }
    add('users', user, permit.user.visibility);
    done(null, visibility);
  });
};

exports.transit = function (o, done) {
  var id = o.id;
  var action = o.action;
  var user = o.user;
  var model = o.model;
  var workflow = o.workflow;
  model.findOne({_id: id}, function (err, found) {
    if (err) {
      return done(err);
    }
    if (!found) {
      return done(errors.notFound());
    }
    var from = found.status;
    if (!from) {
      return done(errors.unauthorized());
    }
    found = exports.json(found);
    if (!exports.permitted(exports.json(user), found, action)) {
      return done(errors.unauthorized())
    }
    exports.workflow(workflow, function (err, workflow) {
      if (err) {
        return done(err);
      }
      if (!workflow) {
        return done(new Error('!workflow'));
      }
      var transitions = workflow.transitions;
      var actions = transitions[from];
      if (!actions) {
        return done(errors.unauthorized());
      }
      var to = actions[action];
      if (!to) {
        return done(errors.unauthorized());
      }
      var permit = workflow.permits[to];
      var usr = found ? found.user : user.id;
      exports.toPermissions(usr, permit, function (err, permissions) {
        if (err) {
          return done(err);
        }
        exports.toVisibility(user, permit, function (err, visibility) {
          if (err) {
            return done(err);
          }
          model.findOneAndUpdate({_id: id}, {
            status: to,
            permissions: permissions,
            visibility: visibility
          }, done);
        });
      });
    });
  });
};
