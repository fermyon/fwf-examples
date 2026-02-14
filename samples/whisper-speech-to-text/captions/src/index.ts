import { Variables } from '@fermyon/spin-sdk';
import { AutoRouter as Router } from 'itty-router';

let router = Router();


// Helper function to create form data with audio blob in the 
// format required by the transcription API.
//
// This is compatible with the OpenAI Whisper API.
function createFormData(audioBlob: ArrayBuffer): FormData {
    const formData = new FormData();
    formData.append('model', 'whisper-1');
    formData.append('file', new Blob([audioBlob], { type: 'audio/wav' }), 'audio.wav');
    formData.append('stream', 'false');
    formData.append('response_format', 'json');

    return formData;
};

// Main transcription endpoint
router.post('/api/transcribe', async (request: Request) => {
    try {
        console.log('Received request:', request);
        // Get raw audio data from request body
        const audioData = await request.arrayBuffer();
        console.log(`Received audio data of size ${audioData.byteLength}`);

        if (!audioData || audioData.byteLength === 0) {
            return new Response(JSON.stringify({ error: 'No audio data provided' }), { status: 400 });
        }

        // Create form data for the transcription API
        const formData = createFormData(audioData);

        // Send request to transcription API
        const transcriptionResponse = await fetch(Variables.get('transcription_api')!, {
            method: 'POST',
            body: formData
        });

        if (!transcriptionResponse.ok) {
            throw new Error(`Transcription API error: ${transcriptionResponse.status}`);
        }

        const transcription = await transcriptionResponse.json();

        return new Response(JSON.stringify({
            text: transcription.text,
            segments: transcription.segments
        }));
    } catch (error) {
        console.error('Transcription error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
    }
});

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => { event.respondWith(router.fetch(event.request, { event })) });
