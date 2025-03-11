let mediaRecorder
let audioChunks = []
let isRecording = false
let captionsContainer

// Create and style captions container
function setupCaptionsContainer() {
    captionsContainer = document.createElement('div')
    captionsContainer.style.position = 'fixed'
    captionsContainer.style.bottom = '50px'
    captionsContainer.style.left = '50%'
    captionsContainer.style.transform = 'translateX(-50%)'
    captionsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
    captionsContainer.style.color = 'white'
    captionsContainer.style.padding = '10px 20px'
    captionsContainer.style.borderRadius = '5px'
    captionsContainer.style.maxWidth = '80%'
    captionsContainer.style.textAlign = 'center'
    captionsContainer.style.maxHeight = '150px'  // Limit height
    captionsContainer.style.overflowY = 'auto'   // Allow scrolling
    document.body.appendChild(captionsContainer)

    // Update CSS for underline effect
    const style = document.createElement('style')
    style.textContent = `
        .highlight {
            border-bottom: 2px solid rgba(255, 255, 255, 0.5);
            padding-bottom: 2px;
            animation: fadeUnderline 2s ease-out;
        }
        @keyframes fadeUnderline {
            from { border-bottom-color: rgba(255, 255, 255, 0.8); }
            to { border-bottom-color: rgba(255, 255, 255, 0.5); }
        }
    `
    document.head.appendChild(style)
}

function startRecording() {
    audioChunks = []
    mediaRecorder.start()
    isRecording = true
    
    // Process chunks every 5 seconds
    const processInterval = setInterval(async () => {
        if (!isRecording) {
            clearInterval(processInterval)
            return
        }
        
        mediaRecorder.stop()
        mediaRecorder.start()
    }, 2500)
}

document.getElementById("start").addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
    })
    mediaRecorder = new MediaRecorder(stream)
    setupCaptionsContainer()

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
    }

    mediaRecorder.onstop = async () => {
        if (!isRecording) {
            stream.getTracks().forEach(track => track.stop())
            return
        }

        const audioBlob = new Blob(audioChunks, { type: "audio/wav" })
        audioChunks = []

        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'audio/wav'
                },
                body: audioBlob
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const result = await response.json()
            
            // Update captions
            if (result.text.trim()) {
                // Remove highlight from previous paragraphs
                const existingHighlights = captionsContainer.querySelectorAll('.highlight')
                existingHighlights.forEach(el => el.classList.remove('highlight'))

                const newParagraph = document.createElement('p')
                newParagraph.textContent = result.text
                newParagraph.style.margin = '5px 0'
                newParagraph.classList.add('highlight')
                captionsContainer.appendChild(newParagraph)
                
                // Auto-scroll to bottom
                captionsContainer.scrollTop = captionsContainer.scrollHeight

                // Clear after 30 words
                const totalWords = Array.from(captionsContainer.querySelectorAll('p'))
                    .reduce((count, p) => count + p.textContent.split(/\s+/).length, 0)
                
                if (totalWords > 30) {
                    const latestText = newParagraph.textContent
                    captionsContainer.innerHTML = ''
                    const freshParagraph = document.createElement('p')
                    freshParagraph.textContent = latestText
                    freshParagraph.style.margin = '5px 0'
                    freshParagraph.classList.add('highlight')
                    captionsContainer.appendChild(freshParagraph)
                }
            }
        } catch (error) {
            console.error('Error sending audio:', error)
        }
    }

    startRecording()
    document.getElementById("start").disabled = true
    document.getElementById("stop").disabled = false
})

document.getElementById("stop").addEventListener("click", () => {
    isRecording = false
    mediaRecorder.stop()
    document.getElementById("start").disabled = false
    document.getElementById("stop").disabled = true
    captionsContainer.remove()
})
