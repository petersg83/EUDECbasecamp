import mysql from 'mysql';
import moment from 'moment';
import _ from 'lodash';
import isEmail from 'validator/lib/isEmail';
import fetch from 'node-fetch';
import config from './credentials';

let token = '';

const fetchWithExceptions = (url, options) => fetch(url, options)
  .then(async (response) => {
    if (response.status < 200 || response.status >= 300) {
      console.log(response);
      throw new Error('Error during API call');
    }
    return JSON.parse(await response.text());
  });

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
        });
    });
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
    const now = moment().add(-2, 'day'); // We let 2 days for the person to renew his membership
    const dates = dateString.split(';').slice(1).map(date => date.trim());
    let isMember = false;
    dates.forEach(date => {
      const to = moment(date.split('_')[1]);
      isMember = isMember || now.isBefore(to);
    });
    isStillMember = isMember;
  }
  return isStillMember;
};

const cleanEmail = email => (email || '').toLowerCase().trim().replace(',', '').replace('/', '');

const run = async () => {
  const peopleInBasecampByEmail = {};
  const basecampProjects = await makeApiCall(`https://3.basecampapi.com/${config.basecamp.accountId}/projects.json`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  for (const bcpProject of basecampProjects) {
    console.log('get people for project', bcpProject.name);
    let index = 1;
    let lastBulkSize = -1;
    while (lastBulkSize !== 0) {
      const somePeopleInProject = await makeApiCall(`https://3.basecampapi.com/${config.basecamp.accountId}/projects/${bcpProject.id}/people.json?page=${index}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      somePeopleInProject.forEach((person, index) => {
        const cleanEmail = (person.email_address || '').trim().toLowerCase();
        peopleInBasecampByEmail[cleanEmail] = peopleInBasecampByEmail[cleanEmail] || { projectsNames: [] };
        peopleInBasecampByEmail[cleanEmail].projectsNames.push(bcpProject.name);
      });
      lastBulkSize = somePeopleInProject.length;
      index += 1;
    }
  }
  let emailsToCheck = Object.keys(peopleInBasecampByEmail);

  if (emailsToCheck.length) {
    const connection = mysql.createConnection({
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
    });
    connection.connect((err) => {
      if (err) throw err;
    });

    const membersWhereClause = `user_email_main IN ('${emailsToCheck.join("', '")}') OR user_email_secondaries REGEXP '${emailsToCheck.join('|')}'`;
    const membersInDb = await makeDBQuery(`SELECT u.user_id, u.user_email_main, u.user_email_secondaries, m.membership_user_id, m.membership_dates
      FROM user u, membership m
      WHERE (${membersWhereClause}) AND u.user_id = m.membership_user_id AND u.user_is_deleted = 'n'
      ;`, connection);

    const projectsWhereClause = `p.project_email in ('${emailsToCheck.join("', '")}') OR u.user_email_main IN ('${emailsToCheck.join("', '")}') OR u.user_email_secondaries REGEXP '${emailsToCheck.join('|')}'`;
    const projectsInDb = await makeDBQuery(`SELECT p.project_id, u.user_id, p.project_email, u.user_email_main, u.user_email_secondaries, m.membership_user_id, m.membership_dates
      FROM project p, user u, membership m
      WHERE (${membersWhereClause}) AND p.project_contact_user_id = u.user_id AND u.user_id = m.membership_user_id AND p.project_is_deleted = 'n';
      ;`, connection);

    membersInDb.forEach((memberInDb) => {
      if (isStillMember(memberInDb.membership_dates)) {
        const allEmailsOfUser = [cleanEmail(memberInDb.user_email_main) || '', ...((memberInDb.user_email_secondaries || '').split(';').map(cleanEmail))];
        emailsToCheck = _.difference(emailsToCheck, allEmailsOfUser);
      } else {
        console.log('not user member anymore', memberInDb.user_email_main, memberInDb.user_email_secondaries, memberInDb.membership_dates);
      }
    });

    projectsInDb.forEach((projectInDb) => {
      if (isStillMember(projectInDb.membership_dates)) {
        const allEmailsOfProject = [cleanEmail(projectInDb.project_email) || '', cleanEmail(projectInDb.user_email_main) || '', ...((projectInDb.user_email_secondaries || '').split(';').map(cleanEmail))];
        emailsToCheck = _.difference(emailsToCheck, allEmailsOfProject);
      } else {
        console.log('not project member anymore', projectInDb.user_email_main, projectInDb.user_email_secondaries, projectInDb.membership_dates);
      }
    });

    connection.end();
  } else {
    console.log('No email to check. Is Basecamp empty ?');
  }

  console.log(emailsToCheck.length, 'people to remove');
  emailsToCheck.forEach(email => console.log(email, peopleInBasecampByEmail[email]));
};

run()
  .then(() => console.log('DONE !'))
  .catch(e => console.log(e));
