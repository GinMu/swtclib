var chai = require('chai');
var assert = chai.assert; 
// var Chain3 = require('../../index');

// var tum3 = new Chain3();

// var FakeHttpProvider = require('./FakeHttpProvider');

// tum3.setProvider(new tum3.providers.HttpProvider(FakeHttpProvider));

var methodExists = function (object, method) {
    it('should have method ' + method + ' implemented', function() {
        // tum3.setProvider(null);
        assert.equal('function', typeof object[method], 'method ' + method + ' is not implemented');
    });
};

var propertyExists = function (object, property) {
    it('should have property ' + property + ' implemented', function() {
        // set dummy provider, to prevent error
        // tum3.setProvider(new FakeHttpProvider());
        // console.log("=========property", object[property]);
        assert.notEqual('undefined', typeof object[property], 'property ' + property + ' is not implemented');
    });
};

module.exports = {
    methodExists: methodExists,
    propertyExists: propertyExists
};

