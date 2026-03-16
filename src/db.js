const knex = require('knex');
const knexfile = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const config = knexfile[env];

const db = knex(config);

module.exports = db;
