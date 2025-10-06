'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('users', 'oidc_sub', {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
        });

        await queryInterface.addColumn('users', 'oidc_provider', {
            type: Sequelize.STRING,
            allowNull: true,
        });

        // Add index for faster lookups
        await queryInterface.addIndex('users', ['oidc_sub'], {
            name: 'users_oidc_sub_index',
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeIndex('users', 'users_oidc_sub_index');
        await queryInterface.removeColumn('users', 'oidc_provider');
        await queryInterface.removeColumn('users', 'oidc_sub');
    },
};
