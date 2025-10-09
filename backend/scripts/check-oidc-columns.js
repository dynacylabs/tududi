#!/usr/bin/env node
const { sequelize } = require('../models');

async function checkOidcColumns() {
    try {
        console.log('Checking OIDC columns in Users table...\n');
        
        // Get table structure
        const [results] = await sequelize.query(`PRAGMA table_info(Users);`);
        
        console.log('Current Users table columns:');
        results.forEach(col => {
            console.log(`  ${col.name}: ${col.type} (nullable: ${col.notnull === 0})`);
        });
        
        const hasOidcSub = results.some(col => col.name === 'oidc_sub');
        const hasOidcProvider = results.some(col => col.name === 'oidc_provider');
        
        console.log('\nOIDC columns status:');
        console.log(`  oidc_sub: ${hasOidcSub ? '✅ exists' : '❌ missing'}`);
        console.log(`  oidc_provider: ${hasOidcProvider ? '✅ exists' : '❌ missing'}`);
        
        if (!hasOidcSub || !hasOidcProvider) {
            console.log('\n⚠️  OIDC columns are missing. Attempting to add them...\n');
            
            if (!hasOidcSub) {
                await sequelize.query(`
                    ALTER TABLE Users ADD COLUMN oidc_sub TEXT NULL;
                `);
                console.log('✅ Added oidc_sub column');
            }
            
            if (!hasOidcProvider) {
                await sequelize.query(`
                    ALTER TABLE Users ADD COLUMN oidc_provider TEXT NULL;
                `);
                console.log('✅ Added oidc_provider column');
            }
            
            // Create unique index on oidc_sub (only for non-null values)
            if (!hasOidcSub) {
                try {
                    await sequelize.query(`
                        CREATE UNIQUE INDEX users_oidc_sub_unique 
                        ON Users(oidc_sub) 
                        WHERE oidc_sub IS NOT NULL;
                    `);
                    console.log('✅ Created unique index on oidc_sub');
                } catch (error) {
                    console.log('⚠️  Index might already exist:', error.message);
                }
            }
        }
        
        // Check password_digest nullability
        const passwordDigestCol = results.find(col => col.name === 'password_digest');
        if (passwordDigestCol) {
            console.log(`\npassword_digest: nullable = ${passwordDigestCol.notnull === 0}`);
            if (passwordDigestCol.notnull !== 0) {
                console.log('⚠️  password_digest is NOT NULL, but OIDC users need it nullable');
            }
        }
        
        console.log('\n✅ Check complete');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkOidcColumns();
