import { Transform, TransformCallback } from 'stream'
import { StringDecoder } from 'string_decoder'

export default class FTPResponseTransformer extends Transform {
    private buf: string[] = []
    private stringDecoder: StringDecoder

    constructor(public readonly decodeEncoding: BufferEncoding = 'ascii') {
        super({ objectMode: true })
        this.stringDecoder = new StringDecoder(decodeEncoding)
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
        const decoded = this.stringDecoder.write(chunk)
        if (decoded.length === 0) return
        this.buf.push(decoded)
        if (decoded.substr(0, 4).match(/^\d\d\d $/)) {
            this.push(this.buf)
            this.buf = []
        }
        callback()
    }
}