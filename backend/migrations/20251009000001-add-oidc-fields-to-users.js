'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Users', 'oidc_sub', {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
        });

        await queryInterface.addColumn('Users', 'oidc_provider', {
            type: Sequelize.STRING,
            allowNull: true,
        });

        // Make password_digest nullable for OIDC users
        await queryInterface.changeColumn('Users', 'password_digest', {
            type: Sequelize.STRING,
            allowNull: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('Users', 'oidc_sub');
        await queryInterface.removeColumn('Users', 'oidc_provider');

        // Revert password_digest to non-nullable
        await queryInterface.changeColumn('Users', 'password_digest', {
            type: Sequelize.STRING,
            allowNull: false,
        });
    },
};
