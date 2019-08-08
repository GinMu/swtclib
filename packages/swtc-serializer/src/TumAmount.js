// Represent amounts and currencies objects
// in Jingtum.
// - Numbers in hex are big-endian.

import { AMOUNT_CONSTS } from "./Constant"
var extend = require("extend")
var WalletFactory = require("swtc-wallet").Factory
var BigInteger = require("bn-plus.js")
var Bignumber = require("bignumber.js")
var isTumCodeFactory = require("./DataCheck").Factory

//
// Amount class in the style of Java's BigInteger class
// https://docs.oracle.com/javase/7/docs/api/java/math/BigInteger.html
//

function Factory(Wallet = WalletFactory()) {
  const { isTumCode, isCurrency, isCustomTum, isAmount } = isTumCodeFactory(Wallet)

  function Amount() {
    // Json format:
    //  integer : SWT
    //  { 'value' : ..., 'currency' : ..., 'issuer' : ...}

    this._value = new BigInteger() // NaN for bad value. Always positive.
    this._offset = 0 // Always 0 for SWT.
    this._is_native = true // Default to SWT. Only valid if value is not NaN.
    this._is_negative = false
    this._currency = null // new String;
    this._issuer = null // new String;
  }

  // Add constants to Amount class
  extend(Amount, AMOUNT_CONSTS)

  Amount.Wallet = Wallet
  Amount.from_json = function(j) {
    return new Amount().parse_json(j)
  }

  // Only check the value of the Amount
  //
  Amount.prototype.is_valid = function() {
    if (this.is_native()) {
      return typeof this._value === "number" && isFinite(this._value)
    }
    return isAmount({
      value: this._value.toString(),
      currency: this._currency,
      issuer: this._issuer
    })
  }

  Amount.prototype.currency = function() {
    return this._currency
  }

  Amount.prototype.is_native = function() {
    return this._is_native
  }

  // Remove check of NaN
  Amount.prototype.is_negative = function() {
    return this._is_negative
  }

  Amount.prototype.is_positive = function() {
    return !this.is_zero() && !this.is_negative()
  }

  Amount.prototype.is_zero = function() {
    return this._value.isZero()
  }

  Amount.prototype.issuer = function() {
    return this._issuer
  }

  Amount.prototype.offset = function() {
    return this._offset
  }

  /*
   * Only set the issuer if the input is
   * a valid address.
   */
  Amount.prototype.parse_issuer = function(issuer) {
    if (Wallet.isValidAddress(issuer)) {
      this._issuer = issuer
    }

    return this
  }

  // <-> j
  /*
   * Convert the input JSON data into
   * a valid Amount object
   * Amount should have 3 properties
   * value
   * issuer/counterparty
   * currency
   * Amount:
   * number: 123456
   * string: "123456"
   * obj:    {"value": 129757.754575,
          "issuer":" ",
          "currency":"USD"}
  */
  Amount.prototype.parse_json = function(in_json) {
    if (typeof in_json === "number") {
      this.parse_swt_value(in_json.toString())
    } else if (typeof in_json === "string") {
      // only allow
      this.parse_swt_value(in_json)
    } else if (typeof in_json === "object") {
      if (!isTumCode(in_json.currency)) {
        throw new Error("Amount.parse_json: Input JSON has invalid Tum info!")
      } else {
        // AMOUNT could have a field named either as 'issuer' or as 'counterparty' for SWT, this can be undefined
        if (in_json.currency !== "SWT") {
          this._currency = in_json.currency
          this._is_native = false
          if (
            typeof in_json.issuer !== "undefined" &&
            in_json.issuer !== null
          ) {
            if (Wallet.isValidAddress(in_json.issuer)) {
              this._issuer = in_json.issuer
              // TODO, need to find a better way for extracting the exponent and digits
              var vpow = Number(in_json.value)
              vpow = String(vpow.toExponential())
              vpow = Number(vpow.substr(vpow.lastIndexOf("e") + 1))
              var offset = 15 - vpow
              var factor = Math.pow(10, offset)
              var newvalue = new Bignumber(in_json.value)
                .multipliedBy(factor)
                .toString()
              this._value = new BigInteger(newvalue, 10)
              this._offset = -1 * offset
            } else {
              throw new Error(
                "Amount.parse_json: Input JSON has invalid issuer info!"
              )
            }
          } else {
            throw new Error(
              "Amount.parse_json: Input JSON has invalid issuer info!"
            )
          }
        } else {
          this.parse_swt_value(in_json.value.toString())
        }
      }
    } else {
      throw new Error("Amount.parse_json: Unsupported JSON type!")
    }
    return this
  }

  /*
   * For SWT, only keep as the integer
   * with precision
   *
   */
  Amount.prototype.parse_swt_value = function(j) {
    var m
    if (typeof j === "string") {
      m = j.match(/^(-?)(\d*)(\.\d{0,6})?$/)
    }
    if (m) {
      if (m[3] === void 0) {
        // Integer notation
        // Changed to agree with floating, values multiplied by 1,000,000.
        this._value = new Bignumber(m[2]).multipliedBy(1e6).toNumber() // new BigInteger(m[2]);
      } else {
        // Float notation : values multiplied by 1,000,000.
        // only keep 6 digits after the decimal point.
        this._value = new Bignumber(m[2] + m[3]).multipliedBy(1e6).toNumber() // int_part+fraction_part;//int_part.add(fraction_part);
      }

      this._is_native = true
      this._offset = 0
      this._is_negative = !!m[1] && this._value !== 0

      if (this._value > Amount.bi_xns_max) {
        this._value = NaN
      }
    } else {
      this._value = NaN
    }

    return this
  }

  // Parse a non-native Tum value for the json wire format.
  // Requires _currency not as SWT!
  Amount.prototype.parse_tum_value = function(j) {
    this._is_native = false
    switch (typeof j) {
      case "number":
        this._is_negative = j < 0
        this._value = new BigInteger(Math.abs(j))
        this._offset = 0
        break

      case "string":
        var i = j.match(/^(-?)(\d+)$/)
        var d = !i && j.match(/^(-?)(\d*)\.(\d*)$/)
        var e = !d && j.match(/^(-?)(\d*)e(-?\d+)$/) // ? !e

        if (e) {
          // e notation
          this._value = e[2] // new BigInteger(e[2]);
          this._offset = parseInt(e[3])
          this._is_negative = !!e[1]
        } else if (d) {
          // float notation
          var precision = d[3].length
          this._value = this._offset = -precision // integer.multiply(Amount.bi_10.clone().pow(precision)).add(fraction);
          this._is_negative = !!d[1]
        } else if (i) {
          // integer notation
          this._value = i[2] // new BigInteger(i[2]);
          this._offset = 0
          this._is_negative = !!i[1]
        } else {
          this._value = NaN
        }
        break

      default:
        this._value = NaN
    }

    return this
  }

  /*
   * Convert the internal obj to JSON
   */
  Amount.prototype.to_json = function() {
    let result
    if (this._is_native) {
      result = new Bignumber(this._value.toString(10))
        .dividedBy(1e6)
        .toString(10)
    } else {
      result = {}
      result.value = new Bignumber(this._value.toString(10))
        .dividedBy(Math.pow(10, Math.abs(this._offset)))
        .toString(10)
      result.currency = this.currency()
      if (this.is_valid()) {
        result.issuer = this._issuer
      }
    }
    return result
  }

  /*
   * Convert the internal Tum Code
   *  to byte array
   * for serialization.
   * Input: a string represents the Tum.
   * Output: Bytes array of size 20 (UINT160).
   *
   */
  Amount.prototype.tum_to_bytes = function() {
    var currencyData = new Array(20)

    for (var i = 0; i < 20; i++) {
      currencyData[i] = 0
    }

    // Only handle the currency with correct symbol
    if (
      isCurrency(this._currency)
    ) {
      var currencyCode = this._currency // 区分大小写
      var end = 14
      var len = currencyCode.length - 1
      for (var j = len; j >= 0; j--) {
        currencyData[end - j] = currencyCode.charCodeAt(len - j) & 0xff
      }
    } else if (isCustomTum(this._currency)) {
      // for TUM code start with 8
      // should be HEX code
      if (/^[0-9A-F]/i.test(this._currency)) {
        currencyData = new BigInteger(this._currency, 16).toArray(null, 20)
      }
    } else {
      throw new Error("Incorrect currency code length.")
    }

    return currencyData
  }
  return Amount
}

module.exports = { Factory, Amount: Factory() }