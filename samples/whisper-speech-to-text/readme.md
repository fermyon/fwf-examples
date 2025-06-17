# Live captioning with Spin, Whisper, and Linode GPUs

This is an example of how to use Spin and Fermyon Wasm Functions together with
an AI inferencing model running on Linode GPUs to provide speech to text.

The Spin application has two components:

* a web UI that records audio from the microphone and sends it to the transcription API
* a transcription API that forwards the audio to the inferencing service running on Linode

## The Transcription service

The transcription service is a service running the OpenAI Whisper model on an Nvidia RTX 4000 Ada Generation GPU on
an LKE cluster.
