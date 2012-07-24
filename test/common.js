/**
 * Sanity tests that should be applied to all drivers
 */

var assert = require('assert');

exports.createSuite = function(pool, specificOptions, specificTestsFactory) {
  var options = {
    blobType: 'BLOB',
    stringType: 'TEXT'
  }, conn = null;
  var tests = {
    'inserting strings': function(done) {
      conn.execute('INSERT INTO test (id, stringcol) VALUES(?, ?)', 
          [1, 'String1']);
      conn.execute("INSERT INTO test (id, stringcol) VALUES(2, 'String2')");
      conn.execute('SELECT * FROM test').all(function(rows) {
        assert.equal(2, rows.length);
        assert.equal(rows[0].id, 1);
        assert.equal(rows[0].stringcol, 'String1');
        assert.equal(rows[1].id, 2);
        assert.equal(rows[1].stringcol, 'String2');
        done();
      });
    },
    'update': function(done) {
      // FIXME: This will break on postgres 9.x if the 'postgresql.conf'
      // option 'bytea_output' is not 'escape'. Perhaps find a way to force
      // this setting on client connection?
      // http://archives.postgresql.org/pgsql-general/2010-10/msg00197.php
      conn.execute('INSERT INTO test (id,blobcol) VALUES(?,?)', 
          [1, new Buffer('abc')]);
      conn.execute('INSERT INTO test (id,blobcol) VALUES(?,?)', 
          [2, new Buffer('def')]);
      conn.execute('UPDATE test SET blobcol = ?', [new Buffer('txt')]);
      conn.execute('SELECT * FROM test').all(function(rows) {
        assert.equal(rows[0].blobcol.toString('utf-8'), 'txt');
        assert.equal(rows[1].blobcol.toString('utf-8'), 'txt');
        done();
      });
    },
    'update where': function(done) {
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [1, 'abc']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [2, 'def']);
      conn.execute("UPDATE test SET stringcol = 'txt' WHERE id=2");
      conn.execute('SELECT * FROM test').all(function(rows) {
        assert.equal(rows[0].stringcol, 'abc');
        assert.equal(rows[1].stringcol, 'txt');
        done();
      });
    },
    'delete': function(done) {
      conn.execute('INSERT INTO test (id) VALUES(?)', [1]);
      conn.execute('INSERT INTO test (id) VALUES(?)', [2]);
      conn.execute('SELECT COUNT(*) FROM test').scalar(function(value) {
        assert.equal(value, 2);
      });
      conn.execute('DELETE FROM test');
      conn.execute('SELECT COUNT(*) FROM test').scalar(function(value) {
        assert.equal(value, 0);
        done();
      });
    },
    'delete where': function(done) {
      conn.execute('INSERT INTO test (id) VALUES(?)', [1]);
      conn.execute('INSERT INTO test (id) VALUES(?)', [2]);
      conn.execute('SELECT COUNT(*) FROM test').scalar(function(value) {
        assert.equal(value, 2);
      });
      conn.execute('DELETE FROM test WHERE id = 2');
      conn.execute('SELECT COUNT(*) FROM test').scalar(function(value) {
        assert.equal(value, 1);
        done();
      });
    },
    'transaction begin': function(done) {
      conn.begin();
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [3, 'ghi']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [4, 'jkl']);
      conn.execute('SELECT stringcol AS s FROM test').all(function(rows) {
        assert.equal(rows.length, 2);
        assert.deepEqual([rows[0].s, rows[1].s], ['ghi', 'jkl']);
        done();
      });
      conn.commit();
    },
    'transaction commit': function(done) {
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [1, 'abc']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [2, 'def']);
      conn.begin();
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [3, 'ghi']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [4, 'jkl']);
      conn.commit();
      conn.execute('SELECT stringcol AS s FROM test').all(function(rows) {
        assert.equal(rows.length, 4);
        assert.deepEqual([rows[0].s, rows[1].s, rows[2].s, rows[3].s],
        ['abc', 'def', 'ghi', 'jkl']);
        done();
      });
    },
    'transaction rollback': function(done) {
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [1, 'abc']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [2, 'def']);
      conn.begin();
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [3, 'ghi']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [4, 'jkl']);
      conn.rollback();
      conn.execute('SELECT stringcol AS s FROM test').all(function(rows) {
        assert.equal(rows.length, 2);
        assert.deepEqual([rows[0].s, rows[1].s], ['abc', 'def']);
        done();
      });
    },
    'transaction savepoints': function(done) {
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [1, 'abc']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [2, 'def']);
      conn.begin();
      conn.execute("UPDATE test SET stringcol = 'txt' WHERE id=2");
      conn.save('s1');
      conn.execute('DELETE FROM test WHERE id = 1');
      conn.execute('SELECT stringcol AS s FROM test').all(function(rows) {
        assert.equal(rows.length, 1);
        assert.equal(rows[0].s, 'txt');
      });
      conn.rollback('s1');
      conn.execute('SELECT stringcol AS s FROM test').all(function(rows) {
        assert.equal(rows.length, 2);
        assert.deepEqual([rows[0].s, rows[1].s], ['abc', 'txt']);
      });
      conn.rollback();
      conn.execute('SELECT stringcol AS s FROM test').all(function(rows) {
        assert.equal(rows.length, 2);
        assert.deepEqual([rows[0].s, rows[1].s], ['abc', 'def']);
        done();
      });
    },
    'select each': function(done) {
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [1, 'abc']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [2, 'def']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [3, 'ghi']);
      var expected = ['abc', 'def', 'ghi'];
      conn.execute('SELECT stringcol AS s FROM test').each(function(row) {
        assert.equal(row.s, expected.shift());
      }, function() {
        assert.equal(expected.length, 0, 
            'only invoke the final callback after the rows callbacks');
        done();
      });
    },
    'select first': function(done) {
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [1, 'abc']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [2, 'def']);
      conn.execute('INSERT INTO test (id,stringcol) VALUES(?,?)', [3, 'ghi']);
      conn.execute('SELECT stringcol AS s FROM test ORDER BY id DESC').first(function(row) {
        assert.equal(row.s, 'ghi');
        done();
      });
    },
  };
  if (specificOptions) {
    for (var key in specificOptions)
      options[key] = specificOptions[key];
  }
  if (typeof specificTestsFactory === 'function') {
    var specificTests = specificTestsFactory(conn);
    if (specificTests)
      for (var key in specificTests) 
        tests[key] = specificTests[key];
  }
  suite('Common -', function() {
    setup(function() {
      conn = pool.get();
      conn.execute('DROP TABLE IF EXISTS test'); 
      conn.execute(
        'CREATE TABLE test (' +
          ' id INTEGER PRIMARY KEY,' +
          ' blobcol ' + options.blobType + ',' +
          ' stringcol ' + options.stringType +
      ')');
    });
    teardown(function() {
      conn.close();
    });
    for (var key in tests)
      test(key, tests[key]);
  });
}
