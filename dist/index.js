'use strict';

var _credentials = require('./credentials');

var _credentials2 = _interopRequireDefault(_credentials);

var _mysql = require('mysql');

var _mysql2 = _interopRequireDefault(_mysql);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _isEmail = require('validator/lib/isEmail');

var _isEmail2 = _interopRequireDefault(_isEmail);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var makeQuery = function makeQuery(queryString, connection) {
  return new Promise(function (resolve, reject) {
    connection.query(queryString, function (error, results, fields) {
      if (error) {
        reject(error);
      };
      resolve(results);
    });
  });
};

var isStillMember = function isStillMember() {
  var dateString = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';

  var now = (0, _moment2.default)();
  var dates = dateString.split(';').slice(1);
  var isMember = false;
  dates.forEach(function (date) {
    var to = (0, _moment2.default)(date.split('_')[1]);
    isMember = isMember || now.isBefore(to);
  });
  return isMember;
};

var run = async function run() {
  var connection = _mysql2.default.createConnection({
    host: _credentials2.default.mysql.host,
    user: _credentials2.default.mysql.user,
    password: _credentials2.default.mysql.password,
    database: 'd028f78b'
  });

  connection.connect(function (err) {
    if (err) throw err;
    console.log('Connected!');
  });

  var emails = ['petersg83@gmail.com', 'famille@vaussion.com', 'shumance26@hotmail.fr'];

  var emailsToCheck = emails.filter(function (e) {
    return (0, _isEmail2.default)(e);
  });
  var whereClause = 'user_email_main IN (\'' + emailsToCheck.join("', '") + '\') OR user_email_secondaries REGEXP \'' + emailsToCheck.join('|') + '\'';
  console.log('whereClause', whereClause);
  var results = await makeQuery('SELECT user.user_id, user.user_email_main, user.user_email_secondaries, membership.membership_user_id, membership.membership_dates\n    FROM user, membership\n    WHERE (' + whereClause + ') AND user.user_id = membership.membership_user_id\n    ;', connection);

  console.log(results);
};

run().then(function () {
  return console.log('DONE !');
}).catch(function (e) {
  return console.log(e);
});