"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
const string_decoder_1 = require("string_decoder");
class FTPResponseTransformer extends stream_1.Transform {
    constructor(decodeEncoding = 'ascii') {
        super({ objectMode: true });
        this.decodeEncoding = decodeEncoding;
        this.buf = [];
        this.stringDecoder = new string_decoder_1.StringDecoder(decodeEncoding);
    }
    _transform(chunk, encoding, callback) {
        const decoded = this.stringDecoder.write(chunk);
        if (decoded.length === 0)
            return;
        this.buf.push(decoded);
        if (decoded.substr(0, 4).match(/^\d\d\d $/)) {
            this.push(this.buf);
            this.buf = [];
        }
        callback();
    }
}
exports.default = FTPResponseTransformer;
//# sourceMappingURL=FTPResponseTransformer.js.map