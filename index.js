import config from './credentials';
import mysql from 'mysql';
import moment from 'moment';
import _ from 'lodash';
import isEmail from 'validator/lib/isEmail';
import fetch from 'node-fetch';

let token = '';

const fetchWithExceptions = (url, options) => fetch(url, options)
  .then(async (response) => {
    if (response.status < 200 || response.status >= 300) {
      console.log(response);
      throw new Error('Error during API call');
    }
    return JSON.parse(await response.text());
  })

const getNewToken = async () => {
  console.log('Getting new token');
  const getNewTokenApiUrl = `https://launchpad.37signals.com/authorization/token?type=refresh&refresh_token=${config.basecamp.refreshToken}&client_id=${config.basecamp.clientId}&redirect_uri=${encodeURIComponent(config.basecamp.redirectUri)}&client_secret=${config.basecamp.clientSecret}`;
  const apiResponse = await fetchWithExceptions(getNewTokenApiUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  token = apiResponse.access_token;
  console.log('Token got');
};

const makeApiCall = (url, options) => new Promise((resolve, reject) => {
  fetchWithExceptions(url, options)
    .then(resolve)
    .catch(async () => {
      await getNewToken();
      options.headers.Authorization = `Bearer ${token}`;
      fetchWithExceptions(url, options)
        .then(resolve)
        .catch((response) => {
          console.log('Resfreshing token didn\'t work');
          console.log(response);
        })
    })
});

const makeDBQuery = (queryString, connection) => new Promise((resolve, reject) => {
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
    const dates = dateString.split(';').slice(1).map(date => date.trim());
    let isMember = false;
    dates.forEach(date => {
      const to = moment(date.split('_')[1]);
      isMember = isMember || now.isBefore(to);
    });
    isStillMember = isMember;
  }
  return isStillMember;
}

const cleanEmail = email => (email || '').toLowerCase().trim().replace(',', '').replace('/', '');

const run = async () => {
  const peopleInBasecamp = {};
  const basecampProjects = await makeApiCall(`https://3.basecampapi.com/${config.basecamp.accountId}/projects.json`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });

  for (const bcpProject of basecampProjects) {
    console.log('get people for project', bcpProject.name);
    let index = 1;
    let lastBulkSize = -1;
    while (lastBulkSize !== 0) {
      const somePeopleInProject = await makeApiCall(`https://3.basecampapi.com/${config.basecamp.accountId}/projects/${bcpProject.id}/people.json?page=${index}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      somePeopleInProject.forEach((person) => {
        peopleInBasecamp[person.id] = peopleInBasecamp[person.id] || { email: person.email_address, projectsIds: [] };
        peopleInBasecamp[person.id].projectsIds.push(bcpProject.id);
      });
      lastBulkSize = somePeopleInProject.length;
      index += 1;
    }
  }

  let emailsToCheck = [];
  for (const personId in peopleInBasecamp) {
    const person = peopleInBasecamp[personId];
    if (person.email && isEmail(person.email)) {
      emailsToCheck.push(person.email.trim().toLowerCase());
    } else {
      console.log('wtf', person);
    }
  }

  if (emailsToCheck.length) {

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

    const whereClause = `user_email_main IN ('${emailsToCheck.join("', '")}') OR user_email_secondaries REGEXP '${emailsToCheck.join('|')}'`;
    const membersInDb = await makeDBQuery(`SELECT user.user_id, user.user_email_main, user.user_email_secondaries, membership.membership_user_id, membership.membership_dates
      FROM user, membership
      WHERE (${whereClause}) AND user.user_id = membership.membership_user_id AND user.user_is_deleted = 'n'
      ;`, connection);
      // TODO: check for projects too

      membersInDb.forEach((memberInDb) => {
        if (isStillMember(memberInDb.membership_dates)) {
          emailsToCheck = _.difference(emailsToCheck, [memberInDb.user_email_main || '', ...((memberInDb.user_email_secondaries || '').split(';').map(cleanEmail))]);
        } else {
          console.log('nottt member anymore', memberInDb.user_email_main, memberInDb.user_email_secondaries, memberInDb.membership_dates);
        }
      });

    connection.release();
  } else {
    console.log('No email to check. Is Basecamp empty ?');
  }

  console.log(emailsToCheck);
}

run()
  .then(() => console.log('DONE !'))
  .catch(e => console.log(e));
