import config from './credentials';
import mysql from 'mysql';
import moment from 'moment';
import _ from 'lodash';
import isEmail from 'validator/lib/isEmail';

const makeQuery = (queryString, connection) => new Promise((resolve, reject) => {
  connection.query(queryString, (error, results, fields) => {
    if (error) {
      reject(error);
    };
    resolve(results);
  });
});

const isStillMember = (dateString) => {
  let isStillMember = false;
  if (dateString) {
    const now = moment();
    const dates = dateString.split(';').slice(1);
    let isMember = false;
    dates.forEach(date => {
      const to = moment(date.split('_')[1]);
      isMember = isMember || now.isBefore(to);
    });
    isStillMember = isMember;
  }
  return isStillMember;
}

const cleanEmail = email => (email || '').toLowerCase().trim();

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

  const emails = ['petersg83@gmail.com', 'famille@vaussion.com', 'shumance26@hotmail.fr', 'franceelsa.boccard@gmail.com'];
  let emailsToCheck = emails.filter(e => isEmail(e));

  const whereClause = `user_email_main IN ('${emailsToCheck.join("', '")}') OR user_email_secondaries REGEXP '${emailsToCheck.join('|')}'`;
  const membersInDb = await makeQuery(`SELECT user.user_id, user.user_email_main, user.user_email_secondaries, membership.membership_user_id, membership.membership_dates
    FROM user, membership
    WHERE (${whereClause}) AND user.user_id = membership.membership_user_id
    ;`, connection);

  console.log(membersInDb);
  membersInDb.forEach((memberInDb) => {
    if (isStillMember(memberInDb.membership_dates)) {
      console.log('still member', memberInDb.user_email_main, memberInDb.user_email_secondaries);
      emailsToCheck = _.difference(emailsToCheck, [memberInDb.user_email_main || '', ...((memberInDb.user_email_secondaries || '').split(';').map(cleanEmail))]);
    } else {
      console.log('nottt member', memberInDb.user_email_main, memberInDb.user_email_secondaries);
    }
  });

  console.log(emailsToCheck);
}

run()
  .then(() => console.log('DONE !'))
  .catch(e => console.log(e));
