function factory(sqlite3) {
  var sqli = require('./sqli');
  sqli.register('sqlite', {
    connect: function(filename, cb) {
      var db = new sqlite3.Database(filename, function(err) {
        if (err) return cb(err, null);
        cb(null, db);
      });
    },
    execute: function(db, sql, params, cb) {
      if (!params)
        params = [];
      db.all(sql, params, function(err, rows) {
        if (err) return cb(err);
        cb(null, {
          each: function(rowCb, endCb) {
            for (var i = 0; i < rows.length; i++)
              rowCb(rows[i]);
            if (typeof endCb === 'function')
              endCb();
          }
        });
      });
    },
  });
};

try {
  factory(require('sqlite3'));
} catch (error) {
  console.log('Could not load sqlite3 wrapper ' + error.message);
}