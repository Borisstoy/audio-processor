const waveform = require('waveform')
const https = require('https')
const remoteFileSize = require('remote-file-size')
const fs = require('fs')
const async = require('async')
const glob = require('glob')
const path = require("path")

const audiofile = '/mnt/c/Users/boris/projects/test-node-waveform/Zanussi_the_spinning_machine_amplified.wav'
const audiofileUrl = 'https://recordings-mix.s3.ca-central-1.amazonaws.com/Zanussi+the+spinning+machine+amplified.wav'
const audiofileUrl2 = 'https://recordings-mix.s3.ca-central-1.amazonaws.com/1-Da_Kine_-_Samoa.flac'
const audiofileUrl3 = 'https://recordings-mix.s3.ca-central-1.amazonaws.com/Valdav2.mp3'

function createPeakFile (audioPart, i) {
    console.log(`Creating peaks file for audio part ${i + 1}...`)

    fs.openSync(`tmp/part-${i}.js`, 'w')
    fs.closeSync(fs.openSync(`tmp/part-${i}.js`, 'w'))

    waveform(audioPart, {
        // options
        'scan': false,                   // whether to do a pass to detect duration    
        // waveform.js options
        waveformjs: `tmp/part-${i}.js`,// path to output-file, or - for stdout as a Buffer
        'wjs-width': 1000,               // width in samples
        'wjs-precision': 8,              // how many digits of precision
        'wjs-plain': false               // exclude metadata in output JSON (default off)
    }, (err, buf) => {
        console.log(`Error while generating peaks file: ${err}`)
    })

    // Delete previous audio part
    if (i > 0) { fs.unlinkSync(`tmp/part-${i - 1}.mp3`) }
}

function getDownloadRanges (file) {
    remoteFileSize(file, (err, fileSize) => {
        if (err) { console.log(`Error while getting remote file size: ${err}`); return }
        let maxRange = 10000000 // Limit for 100mb (1e+8 bytes)
        let divider = 0
        let partSize = 0
        let partSizeSum = 0
        let ranges = []

        console.log(`----------------------------------------------------------`)
        console.log(`Creating bytes ranges for max ${maxRange / 100000}mb...`)
        
        // Find fill divider to get ranges inferior to the limit set
        while (fileSize / divider > maxRange) { divider++ }
        
        // Define the part size
        partSize = fileSize / divider
        
        // Create dicitonnay of ranges based on a part size
        while (partSizeSum < fileSize) {
            ranges.push(`${Math.floor(partSizeSum)}-${Math.floor(partSizeSum) + Math.floor(partSize)}`)
            partSizeSum = partSizeSum + partSize
        }
        
        console.log(`Total ranges: ${ranges.length}`)
        console.log(ranges)
        
        downloadFiles(ranges, file)
    })
}

async function downloadFiles (ranges, file) {
    // Get file extension
    const ext = file.substr(file.lastIndexOf('.') + 1)
    
    // Create a queue allowing non concurrent downloads, one range after the other
    const q = async.queue((task, callback) => {
        console.log(`----------------------------------------------------------`)
        console.log(`Downloading range ${task.i + 1}...`)
        
        const audioPart = `tmp/part-${task.i}.${ext}`
        
        const f = fs.createWriteStream(audioPart)
        
        // Download and write file
        const options = { headers: { range: `bytes=${task.range}` }}

        // Create one audio file per range
        
        https.get(file, options, (res) => {
            res.pipe(f)
            
            f.on('finish', () => {
                f.close()
                createPeakFile(audioPart, task.i)                
                callback()
            })
        })
    }, 1)
    
    q.drain(() => {
        console.log(`----------------------------------------------------------`)
        console.log('Download queue completed !')
        console.log(`----------------------------------------------------------`)
        console.log('Merging peaks files...')
        console.log(`----------------------------------------------------------`)
                
        // mergePeaksFiles()
    })
    
    ranges.forEach((range, i) => {
        q.push({ range, i }, (err) => { if (err) { console.log(`Error while queuing downloads: ${err}`)}}) 
    })
}
1
function mergePeaksFiles () {
    const path = `tmp/part-*.js`
    const output = 'tmp/peaks.json'

    // Open up a new empty file
    fs.openSync(output, 'w')

    // Read all peaks parts files
    glob(path, (err, files) => {
        if(err) { console.log('Cannot read the folder, something goes wrong with glob', err) }
        
        files.forEach((file, i) => {
            fs.readFile(file, 'utf8', (err, data) => {
                if (err) { console.log('cannot read the file, something goes wrong with the file', err) }
                const parsed = JSON.parse(data)
                console.log(parsed)
                // Treat data, comma separate, array-ified
                let peaks
                if (files.length === 1) { peaks = `[${parsed}]` }
                if (i === 0 && files.length > 1) { peaks = `[${parsed},` }
                if (i === files.length - 1) { peaks = `${parsed}]` }
                
                // Append to JSON
                fs.writeFile(
                    output, 
                    data, 
                    { flag: 'a' }, 
                    (err) => { if (!err) { console.log(`JSON peaks ${i} merged successfully`) }}
                )
            })
        })
    })

}

getDownloadRanges(audiofileUrl3)
// mergePeaksFiles()