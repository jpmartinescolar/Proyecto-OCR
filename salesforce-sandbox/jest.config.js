const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        // Módulo solo de CSS (se importa con @import desde otros componentes)
        '^c/bandejaContableEstilos$': '<rootDir>/force-app/main/default/lwc/bandejaContableEstilos/bandejaContableEstilos.css'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
