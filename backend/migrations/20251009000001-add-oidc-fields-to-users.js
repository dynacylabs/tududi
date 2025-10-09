'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('Users');
        
        // Only add oidc_sub if it doesn't exist
        if (!tableInfo.oidc_sub) {
            await queryInterface.addColumn('Users', 'oidc_sub', {
                type: Sequelize.STRING,
                allowNull: true,
            });
            
            // Add unique constraint separately
            await queryInterface.addIndex('Users', ['oidc_sub'], {
                unique: true,
                name: 'users_oidc_sub_unique',
                where: {
                    oidc_sub: {
                        [Sequelize.Op.ne]: null
                    }
                }
            });
        }

        // Only add oidc_provider if it doesn't exist
        if (!tableInfo.oidc_provider) {
            await queryInterface.addColumn('Users', 'oidc_provider', {
                type: Sequelize.STRING,
                allowNull: true,
            });
        }

        // Make password_digest nullable for OIDC users (if not already)
        if (tableInfo.password_digest && tableInfo.password_digest.allowNull === false) {
            await queryInterface.changeColumn('Users', 'password_digest', {
                type: Sequelize.STRING,
                allowNull: true,
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('Users');
        
        // Remove index first if it exists
        try {
            await queryInterface.removeIndex('Users', 'users_oidc_sub_unique');
        } catch (error) {
            // Index might not exist, continue
        }
        
        if (tableInfo.oidc_sub) {
            await queryInterface.removeColumn('Users', 'oidc_sub');
        }
        
        if (tableInfo.oidc_provider) {
            await queryInterface.removeColumn('Users', 'oidc_provider');
        }

        // Revert password_digest to non-nullable (be careful with this in production)
        await queryInterface.changeColumn('Users', 'password_digest', {
            type: Sequelize.STRING,
            allowNull: false,
        });
    },
};
