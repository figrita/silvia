export class RealtimeGraph {
    constructor(canvas, options = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.options = {
            historySize: options.historySize || 200,
            gridLines: options.gridLines !== undefined ? options.gridLines : 4,
            gridSpacing: options.gridSpacing || 40,
            backgroundColor: options.backgroundColor || '#222',
            gridColor: options.gridColor || '#333',
            lineColor: options.lineColor || null, // Will use theme color if null
            dotColor: options.dotColor || null, // Will use theme color if null
            textColor: options.textColor || '#ccc',
            lineWidth: options.lineWidth || 2,
            dotRadius: options.dotRadius || 3,
            showValue: options.showValue !== undefined ? options.showValue : true,
            minValue: options.minValue !== undefined ? options.minValue : null,
            maxValue: options.maxValue !== undefined ? options.maxValue : null,
            autoScale: options.autoScale !== undefined ? options.autoScale : true
        }
        
        this.history = new Array(this.options.historySize).fill(0)
        this.currentValue = 0
        this.animationFrameId = null
    }
    
    updateValue(value) {
        this.currentValue = value
        this.history.push(value)
        if (this.history.length > this.options.historySize) {
            this.history.shift()
        }
    }
    
    draw() {
        const {width, height} = this.canvas
        const ctx = this.ctx
        
        // Clear canvas
        ctx.fillStyle = this.options.backgroundColor
        ctx.fillRect(0, 0, width, height)
        
        // Draw grid
        ctx.strokeStyle = this.options.gridColor
        ctx.lineWidth = 1
        
        // Determine value range
        let minVal = this.options.minValue
        let maxVal = this.options.maxValue
        
        if (this.options.autoScale || minVal === null || maxVal === null) {
            // Auto-calculate range from history
            const validHistory = this.history.filter(v => v !== null && !isNaN(v))
            if (validHistory.length > 0) {
                const histMin = Math.min(...validHistory)
                const histMax = Math.max(...validHistory)
                
                if (minVal === null) minVal = histMin
                if (maxVal === null) maxVal = histMax
                
                // Add some padding to the range
                const padding = (maxVal - minVal) * 0.1 || 0.5
                if (this.options.autoScale) {
                    minVal = minVal - padding
                    maxVal = maxVal + padding
                }
            } else {
                // Default range if no valid data
                if (minVal === null) minVal = -1
                if (maxVal === null) maxVal = 1
            }
        }
        
        // Ensure we have a valid range
        if (maxVal === minVal) {
            maxVal = minVal + 1
        }
        
        const range = maxVal - minVal
        
        // Draw horizontal grid lines
        for (let i = 0; i <= this.options.gridLines; i++) {
            const y = (i / this.options.gridLines) * height
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
        }
        
        // Draw vertical grid lines
        for (let x = 0; x < width; x += this.options.gridSpacing) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
            ctx.stroke()
        }
        
        // Draw zero line if in range
        if (minVal < 0 && maxVal > 0) {
            const zeroY = height - ((-minVal / range) * height)
            ctx.strokeStyle = '#555'
            ctx.lineWidth = 2
            ctx.setLineDash([5, 5])
            ctx.beginPath()
            ctx.moveTo(0, zeroY)
            ctx.lineTo(width, zeroY)
            ctx.stroke()
            ctx.setLineDash([])
        }
        
        // Draw value curve
        if (this.history.length > 1) {
            // Get theme color for line
            let lineColor = this.options.lineColor
            if (!lineColor) {
                const numberHue = getComputedStyle(document.documentElement).getPropertyValue('--number-hue').trim()
                const numberSat = getComputedStyle(document.documentElement).getPropertyValue('--number-sat').trim()
                const numberLight = getComputedStyle(document.documentElement).getPropertyValue('--number-light').trim()
                lineColor = `hsl(${numberHue}, ${numberSat}, ${numberLight})`
            }
            
            ctx.strokeStyle = lineColor
            ctx.lineWidth = this.options.lineWidth
            ctx.beginPath()
            
            this.history.forEach((value, index) => {
                const x = (index / (this.history.length - 1)) * width
                const normalizedValue = (value - minVal) / range
                const y = height - (normalizedValue * height)
                
                if (index === 0) {
                    ctx.moveTo(x, y)
                } else {
                    ctx.lineTo(x, y)
                }
            })
            
            ctx.stroke()
        }
        
        // Draw current value indicator dot (only if we have a valid current value)
        if (this.currentValue !== null && this.currentValue !== undefined) {
            const normalizedCurrent = (this.currentValue - minVal) / range
            const currentY = height - (normalizedCurrent * height)

            // Get theme color for dot
            let dotColor = this.options.dotColor
            if (!dotColor) {
                const numberHue = getComputedStyle(document.documentElement).getPropertyValue('--number-hue').trim()
                const numberSat = getComputedStyle(document.documentElement).getPropertyValue('--number-sat').trim()
                const lightValue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--number-light').replace('%', '').trim())
                const brighterLight = Math.min(lightValue + 20, 90)
                dotColor = `hsl(${numberHue}, ${numberSat}, ${brighterLight}%)`
            }

            ctx.fillStyle = dotColor
            ctx.beginPath()
            ctx.arc(width - 5, currentY, this.options.dotRadius, 0, Math.PI * 2)
            ctx.fill()
        }

        // Draw value text
        if (this.options.showValue && this.currentValue !== null && this.currentValue !== undefined) {
            ctx.fillStyle = this.options.textColor
            ctx.font = '12px monospace'
            ctx.textAlign = 'right'
            ctx.fillText(this.currentValue.toFixed(3), width - 10, 15)
            
            // Draw min/max labels
            ctx.textAlign = 'left'
            ctx.fillStyle = '#666'
            ctx.fillText(maxVal.toFixed(1), 5, 15)
            ctx.fillText(minVal.toFixed(1), 5, height - 5)
        }
    }
    
    startAnimation(updateCallback) {
        const animate = () => {
            if (updateCallback) {
                const value = updateCallback()
                if (value !== null && value !== undefined) {
                    this.updateValue(value)
                }
            }
            this.draw()
            this.animationFrameId = requestAnimationFrame(animate)
        }
        animate()
    }
    
    stopAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }
    
    destroy() {
        this.stopAnimation()
    }
    
    setHistory(history) {
        this.history = history.slice(-this.options.historySize)
        while (this.history.length < this.options.historySize) {
            this.history.unshift(0)
        }
    }
    
    clearHistory() {
        this.history = new Array(this.options.historySize).fill(0)
    }
    
    setOptions(newOptions) {
        Object.assign(this.options, newOptions)
        
        // Resize history if needed
        if (newOptions.historySize && newOptions.historySize !== this.history.length) {
            const newHistory = new Array(newOptions.historySize).fill(0)
            const copyCount = Math.min(this.history.length, newOptions.historySize)
            const startIdx = Math.max(0, this.history.length - copyCount)
            
            for (let i = 0; i < copyCount; i++) {
                newHistory[newOptions.historySize - copyCount + i] = this.history[startIdx + i]
            }
            
            this.history = newHistory
            this.options.historySize = newOptions.historySize
        }
    }
}