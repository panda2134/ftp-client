declare module 'length-stream' {
    function lengthStream (lengthListener: (len: number) => void): NodeJS.stream.Stream
    function lengthStream (options: NodeJS.stream.TransformOptions, lengthListener: (len: number) => void): NodeJS.stream.Stream
    export = lengthStream
}