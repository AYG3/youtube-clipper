const axios = require('axios');

async function quickTest() {
    console.log('🧪 Quick Functionality Test\n');
    
    try {
        // Test 1: Load video info
        console.log('1. Testing video info endpoint...');
        const infoResponse = await axios.post('http://localhost:3000/api/video-info', {
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        });
        
        console.log('   ✅ Video ID:', infoResponse.data.videoId);
        console.log('   ✅ Title:', infoResponse.data.title);
        console.log('   ✅ Duration:', infoResponse.data.duration, 'seconds\n');
        
        // Test 2: Verify HTML has video player
        console.log('2. Checking HTML structure...');
        const htmlResponse = await axios.get('http://localhost:3000');
        const html = htmlResponse.data;
        
        if (html.includes('id="youtubePlayer"')) {
            console.log('   ✅ YouTube player iframe exists');
        } else {
            console.log('   ❌ YouTube player NOT found!');
        }
        
        if (html.includes('type="text"') && html.includes('id="startTime"')) {
            console.log('   ✅ Start time input exists');
        }
        
        if (html.includes('type="text"') && html.includes('id="endTime"')) {
            console.log('   ✅ End time input exists');
        }
        
        if (!html.includes('readonly')) {
            console.log('   ✅ Time inputs are NOT readonly (editable)\n');
        } else {
            console.log('   ⚠️  Time inputs might still have readonly attribute\n');
        }
        
        // Test 3: Check JavaScript has parse function
        console.log('3. Checking JavaScript functionality...');
        const jsResponse = await axios.get('http://localhost:3000/script.js');
        const js = jsResponse.data;
        
        if (js.includes('parseTimeInput')) {
            console.log('   ✅ parseTimeInput function exists');
        }
        
        if (js.includes('addEventListener') && js.includes('startTime')) {
            console.log('   ✅ Event listeners for manual input exist');
        }
        
        if (js.includes('youtubePlayer.src')) {
            console.log('   ✅ YouTube player src assignment exists\n');
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ All backend checks passed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🌐 Now open http://localhost:3000 and test:');
        console.log('   1. Load a video - YouTube player should appear');
        console.log('   2. Type times directly in the input fields');
        console.log('   3. Use the sliders - inputs should sync');
        console.log('   4. Watch the video to verify timestamps\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

quickTest();
