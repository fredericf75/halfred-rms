exports.up = async function(knex) {
  await knex.schema.createTable('contacts', (table) => {
    table.text('id').primary();
    table.text('name').notNullable();
    table.text('email');
    table.text('phone');
    table.text('relationship_type');
    table.enum('status', ['active', 'dormant', 'archived']).defaultTo('active');
    table.date('date_met');
    table.datetime('last_interaction_date');
    table.text('last_interaction_type');
    table.integer('health_score').defaultTo(50);
    table.integer('check_in_interval_days');
    table.date('next_check_in_date');
    table.text('notes');
    table.text('preferred_contact_method');
    table.text('time_zone');
    table.json('tags');
    table.json('custom_fields');
    table.text('embedding'); // Storing vector embedding as a JSON formatted string
    table.timestamps(true, true);
  });

  await knex.schema.createTable('interaction_log', (table) => {
    table.text('id').primary();
    table.text('contact_id').notNullable().references('id').inTable('contacts').onDelete('CASCADE');
    table.text('type').notNullable();
    table.text('subject');
    table.text('summary');
    table.text('notes');
    table.datetime('interaction_date').notNullable();
    table.integer('duration_minutes');
    table.text('external_id');
    table.text('related_task_id');
    table.json('tags');
    table.text('embedding');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('relationship_notes', (table) => {
    table.text('id').primary();
    table.text('contact_id').notNullable().references('id').inTable('contacts').onDelete('CASCADE');
    table.text('category').notNullable();
    table.text('content').notNullable();
    table.integer('version').defaultTo(1);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('task_contact_link', (table) => {
    table.text('id').primary();
    table.text('task_id').notNullable();
    table.text('contact_id').notNullable().references('id').inTable('contacts').onDelete('CASCADE');
    table.text('link_type');
    table.text('context');
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['task_id', 'contact_id']); // Prevent duplicate links
  });

  await knex.schema.createTable('reminders', (table) => {
    table.text('id').primary();
    table.text('contact_id').notNullable().references('id').inTable('contacts').onDelete('CASCADE');
    table.text('type').notNullable();
    table.date('scheduled_date').notNullable();
    table.time('scheduled_time');
    table.enum('status', ['pending', 'sent', 'snoozed', 'dismissed']).defaultTo('pending');
    table.date('snoozed_until');
    table.text('message');
    table.datetime('completed_at');
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Create Indexes
  await knex.schema.alterTable('contacts', (table) => {
    table.index('name');
    table.index('status');
    table.index('last_interaction_date');
    table.index('next_check_in_date');
  });

  await knex.schema.alterTable('interaction_log', (table) => {
    table.index('contact_id');
    table.index('interaction_date');
    table.index('type');
  });

  await knex.schema.alterTable('relationship_notes', (table) => {
    table.index('contact_id');
    table.index(['contact_id', 'category']);
  });

  await knex.schema.alterTable('task_contact_link', (table) => {
    table.index('task_id');
    table.index('contact_id');
  });

  await knex.schema.alterTable('reminders', (table) => {
    table.index('contact_id');
    table.index(['scheduled_date', 'status']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('reminders');
  await knex.schema.dropTableIfExists('task_contact_link');
  await knex.schema.dropTableIfExists('relationship_notes');
  await knex.schema.dropTableIfExists('interaction_log');
  await knex.schema.dropTableIfExists('contacts');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
