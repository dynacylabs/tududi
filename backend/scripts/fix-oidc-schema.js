#!/usr/bin/env node
/**
 * Fix OIDC schema issues directly with SQL
 * This script manually adds OIDC columns and makes password_digest nullable
 */

const { sequelize } = require('../models');

async function fixSchema() {
    try {
        console.log('🔧 Fixing OIDC schema...\n');
        
        // Get current table structure
        const [columns] = await sequelize.query(`PRAGMA table_info(Users);`);
        
        console.log('Current Users table structure:');
        columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} (notnull: ${col.notnull}, default: ${col.dflt_value})`);
        });
        
        const hasOidcSub = columns.some(col => col.name === 'oidc_sub');
        const hasOidcProvider = columns.some(col => col.name === 'oidc_provider');
        const passwordCol = columns.find(col => col.name === 'password_digest');
        
        console.log('\n📋 Schema Status:');
        console.log(`  oidc_sub: ${hasOidcSub ? '✅ exists' : '❌ missing'}`);
        console.log(`  oidc_provider: ${hasOidcProvider ? '✅ exists' : '❌ missing'}`);
        console.log(`  password_digest nullable: ${passwordCol && passwordCol.notnull === 0 ? '✅ yes' : '❌ no (this is the problem!)'}`);
        
        // The issue: SQLite doesn't support ALTER COLUMN to change constraints
        // We need to recreate the table
        
        if (!hasOidcSub || !hasOidcProvider || (passwordCol && passwordCol.notnull === 1)) {
            console.log('\n⚠️  Schema needs fixing. Creating new table structure...\n');
            
            // Start transaction
            await sequelize.query('BEGIN TRANSACTION;');
            
            try {
                // 1. Create new table with correct schema
                console.log('1. Creating new Users table with correct schema...');
                await sequelize.query(`
                    CREATE TABLE Users_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        uid TEXT UNIQUE,
                        name TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        password_digest TEXT NULL,
                        oidc_sub TEXT NULL,
                        oidc_provider TEXT NULL,
                        appearance TEXT DEFAULT 'light',
                        language TEXT DEFAULT 'en',
                        timezone TEXT DEFAULT 'UTC',
                        first_day_of_week INTEGER DEFAULT 0,
                        task_summary_enabled INTEGER DEFAULT 0,
                        task_summary_frequency TEXT DEFAULT 'weekly',
                        task_intelligence_enabled INTEGER DEFAULT 0,
                        auto_suggest_next_actions_enabled INTEGER DEFAULT 0,
                        pomodoro_enabled INTEGER DEFAULT 0,
                        productivity_assistant_enabled INTEGER DEFAULT 0,
                        next_task_suggestion_enabled INTEGER DEFAULT 0,
                        today_settings TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                `);
                console.log('   ✅ New table created');
                
                // 2. Copy data from old table
                console.log('2. Copying data from old table...');
                const columnsToSelect = columns.map(col => col.name).join(', ');
                await sequelize.query(`
                    INSERT INTO Users_new (${columnsToSelect})
                    SELECT ${columnsToSelect}
                    FROM Users;
                `);
                console.log('   ✅ Data copied');
                
                // 3. Drop old table
                console.log('3. Dropping old table...');
                await sequelize.query('DROP TABLE Users;');
                console.log('   ✅ Old table dropped');
                
                // 4. Rename new table
                console.log('4. Renaming new table...');
                await sequelize.query('ALTER TABLE Users_new RENAME TO Users;');
                console.log('   ✅ Table renamed');
                
                // 5. Create indexes
                console.log('5. Creating indexes...');
                await sequelize.query(`
                    CREATE UNIQUE INDEX users_oidc_sub_unique 
                    ON Users(oidc_sub) 
                    WHERE oidc_sub IS NOT NULL;
                `);
                console.log('   ✅ Unique index on oidc_sub created');
                
                // Commit transaction
                await sequelize.query('COMMIT;');
                
                console.log('\n✅ Schema fixed successfully!');
                console.log('\n📊 Verifying new structure:');
                
                const [newColumns] = await sequelize.query(`PRAGMA table_info(Users);`);
                newColumns.forEach(col => {
                    if (['password_digest', 'oidc_sub', 'oidc_provider'].includes(col.name)) {
                        console.log(`  ${col.name}: ${col.type} (notnull: ${col.notnull}) ✅`);
                    }
                });
                
            } catch (error) {
                // Rollback on error
                await sequelize.query('ROLLBACK;');
                throw error;
            }
        } else {
            console.log('\n✅ Schema is already correct! No changes needed.');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

fixSchema();
