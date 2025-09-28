import {registerNode} from '../registry.js'

registerNode({
    slug: 'clock',
    icon: '🕐',
    label: 'Clock',
    tooltip: 'Outputs real-world time values (seconds, minutes, hours, etc.). Useful for time-based animations and effects.',
    
    input: {},
    
    options: {
        'output': {
            label: 'Output',
            type: 'select',
            default: 'seconds',
            choices: [
                {value: 'seconds', name: 'Seconds (0-59)'},
                {value: 'minutes', name: 'Minutes (0-59)'},
                {value: 'hours', name: 'Hours (0-23)'},
                {value: 'hours12', name: 'Hours 12h (0-11)'},
                {value: 'daySeconds', name: 'Seconds of Day'},
                {value: 'dayProgress', name: 'Day Progress (0-1)'},
                {value: 'weekProgress', name: 'Week Progress (0-1)'},
                {value: 'yearProgress', name: 'Year Progress (0-1)'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                if(location) {
                    const value = this._getCurrentValue()
                    gl.uniform1f(location, value)
                }
            }
        },
        'normalized': {
            label: 'Normalized',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                if(location) {
                    const value = this._getNormalizedValue()
                    gl.uniform1f(location, value)
                }
            }
        }
    },
    
    _getCurrentValue(){
        const now = new Date()
        const outputType = this.getOption('output')
        
        switch(outputType){
            case 'minutes':
                return now.getMinutes()
            case 'hours':
                return now.getHours()
            case 'hours12':
                return now.getHours() % 12
            case 'daySeconds':
                return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000
            case 'dayProgress':
                const daySeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000
                return daySeconds / 86400
            case 'weekProgress':
                const dayOfWeek = now.getDay()
                const weekSeconds = dayOfWeek * 86400 + now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
                return weekSeconds / (7 * 86400)
            case 'yearProgress':
                const yearStart = new Date(now.getFullYear(), 0, 1)
                const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
                const yearDuration = yearEnd - yearStart
                const yearElapsed = now - yearStart
                return yearElapsed / yearDuration
            case 'seconds':
            default:
                return now.getSeconds() + now.getMilliseconds() / 1000
        }
    },
    
    _getNormalizedValue(){
        const value = this._getCurrentValue()
        const outputType = this.getOption('output')
        
        switch(outputType){
            case 'seconds':
                return value / 60
            case 'minutes':
                return value / 60
            case 'hours':
                return value / 24
            case 'hours12':
                return value / 12
            case 'daySeconds':
                return value / 86400
            case 'dayProgress':
            case 'weekProgress':
            case 'yearProgress':
                return value  // Already normalized
            default:
                return value
        }
    }
})