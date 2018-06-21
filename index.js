import config from './credentials';
import mysql from 'mysql';
import moment from 'moment';
import isEmail from 'validator/lib/isEmail';

const makeQuery = (queryString, connection) => new Promise((resolve, reject) => {
  connection.query(queryString, (error, results, fields) => {
    if (error) {
      reject(error);
    };
    resolve(results);
  });
});

const isStillMember = (dateString = '') => {
  const now = moment();
  const dates = dateString.split(';').slice(1);
  let isMember = false;
  dates.forEach(date => {
    const to = moment(date.split('_')[1]);
    isMember = isMember || now.isBefore(to);
  });
  return isMember;
}


const run = async () => {
  const connection = mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: 'd028f78b',
  });

  connection.connect((err) => {
    if (err) throw err;
    console.log('Connected!');
  });

  const emails = ['petersg83@gmail.com', 'famille@vaussion.com', 'shumance26@hotmail.fr'];

  const emailsToCheck = emails.filter(e => isEmail(e));
    const whereClause = `user_email_main IN ('${emailsToCheck.join("', '")}') OR user_email_secondaries REGEXP '${emailsToCheck.join('|')}'`;
  console.log('whereClause', whereClause);
  const results = await makeQuery(`SELECT user.user_id, user.user_email_main, user.user_email_secondaries, membership.membership_user_id, membership.membership_dates
    FROM user, membership
    WHERE (${whereClause}) AND user.user_id = membership.membership_user_id
    ;`, connection);

  console.log(results);
}

run()
  .then(() => console.log('DONE !'))
  .catch(e => console.log(e));
