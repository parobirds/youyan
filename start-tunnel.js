import ngrok from 'ngrok';

async function startTunnel() {
  try {
    const url = await ngrok.connect({
      addr: 5173,
      proto: 'http',
    });
    console.log('Ngrok tunnel started:', url);
  } catch (error) {
    console.error('Failed to start ngrok:', error.message);
    process.exit(1);
  }
}

startTunnel();
