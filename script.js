const video = document.getElementById("videoInput");
const canvas = document.getElementById("overlay");
const namesList = document.getElementById("names");
const registerDialog = document.getElementById("registerDialog");
const facePreview = document.getElementById("facePreview");
const nameInput = document.getElementById("nameInput");
const submitFaceBtn = document.getElementById("submitFace");
const clearStorageBtn = document.getElementById("clearStorageBtn");
const showAbsentBtn = document.getElementById("showAbsentBtn");
const downloadBtn = document.getElementById("downloadBtn");
const absentDialog = document.getElementById("absentDialog");
const absentList = document.getElementById("absentList");

const labeledDescriptors = [];
const attendanceSet = new Set();
let knownNames = [];
let isDialogOpen = false;
let unknownFaceCanvas = null;

async function fetchKnownNames() {
  const res = await fetch('http://localhost:3000/known-names');
  knownNames = await res.json();
}

async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
    console.log("🎥 Webcam started successfully.");
  } catch (err) {
    console.error("❌ Error accessing webcam:", err);
  }
}

async function loadLabeledImages() {
  return Promise.all(
    knownNames.map(async (label) => {
      const descriptions = [];

      for (let i = 1; i <= 2; i++) {
        try {
          const img = await faceapi.fetchImage(`labeled_images/${label}/${i}.jpg`);
          const detection = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            descriptions.push(detection.descriptor);
          }
        } catch (e) {
          console.warn(`⚠️ Could not load ${label}/${i}.jpg`, e);
        }
      }

      if (descriptions.length === 0) {
        console.warn(`❌ Skipping "${label}" — no valid descriptors.`);
        return null;
      }

      return new faceapi.LabeledFaceDescriptors(label, descriptions);
    })
  );
}

function loadStoredAttendance() {
  const stored = JSON.parse(localStorage.getItem("attendance") || "[]");
  stored.forEach(entry => {
    if (!attendanceSet.has(entry.name)) {
      attendanceSet.add(entry.name);
      const li = document.createElement("li");
      li.innerHTML = `✔ <strong>${entry.name}</strong> marked present at <span class="time">${entry.time}</span>`;
      namesList.appendChild(li);
    }
  });
}

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@0.8.9/model/'),
  faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@0.8.9/model/'),
  faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@0.8.9/model/')
])
  .then(fetchKnownNames)
  .then(loadLabeledImages)
  .then(descriptors => {
    descriptors.filter(Boolean).forEach(d => labeledDescriptors.push(d));
    console.log("✅ Loaded descriptors for:", labeledDescriptors.map(d => d.label));
    loadStoredAttendance();
    startVideo();
  })
  .catch(err => console.error("❌ Model loading error:", err));

video.addEventListener("playing", () => {
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  setInterval(async () => {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (labeledDescriptors.length === 0) return;

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    let someoneMatched = false;

    resizedDetections.forEach(detection => {
      const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
      const name = bestMatch.label;

      const box = detection.detection.box;
      const drawBox = new faceapi.draw.DrawBox(box, {
        label: name,
        boxColor: name === "unknown" ? "red" : "green"
      });
      drawBox.draw(canvas);

      if (name !== "unknown") {
        someoneMatched = true;
        const history = JSON.parse(localStorage.getItem("attendance") || "[]");
        const alreadyMarked = history.some(e => e.name === name);

        if (!attendanceSet.has(name) && !alreadyMarked) {
          attendanceSet.add(name);
          const time = new Date().toLocaleTimeString();
          const entry = { name, time };

          const li = document.createElement("li");
          li.innerHTML = `✔ <strong>${name}</strong> marked present at <span class="time">${time}</span>`;
          namesList.appendChild(li);

          history.push(entry);
          localStorage.setItem("attendance", JSON.stringify(history));
        }
      }
    });

    if (!someoneMatched && detections.length > 0 && !isDialogOpen) {
      isDialogOpen = true;
      const box = detections[0].detection.box;

      setTimeout(() => {
        unknownFaceCanvas = document.createElement("canvas");
        unknownFaceCanvas.width = box.width;
        unknownFaceCanvas.height = box.height;

        const ctx = unknownFaceCanvas.getContext("2d");
        ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

        facePreview.src = unknownFaceCanvas.toDataURL("image/jpeg");
        nameInput.value = "";
        registerDialog.showModal();
      }, 2000);
    }
  }, 200);
});

submitFaceBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a name.");
    return;
  }

  const blob = await new Promise(resolve => {
    unknownFaceCanvas.toBlob(resolve, 'image/jpeg');
  });

  const formData = new FormData();
  formData.append('name', name);
  formData.append('image', blob, 'face.jpg');

  try {
    const res = await fetch('http://localhost:3000/register', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      alert("✅ Face registered successfully! Reloading...");
      location.reload();
    } else {
      alert("❌ Failed to register face.");
    }
  } catch (err) {
    console.error(err);
    alert("❌ Failed to register face.");
  }
});

registerDialog.addEventListener("close", () => {
  isDialogOpen = false;
});

document.getElementById("closeDialog").addEventListener("click", () => {
  registerDialog.close();
  isDialogOpen = false;
});

clearStorageBtn.addEventListener("click", () => {
  localStorage.removeItem("attendance");
  location.reload();
});

showAbsentBtn.addEventListener("click", () => {
  const presentNames = JSON.parse(localStorage.getItem("attendance") || "[]").map(entry => entry.name);
  const absentees = knownNames.filter(name => !presentNames.includes(name));

  absentList.innerHTML = absentees.length
    ? absentees.map(name => `<li>${name}</li>`).join("")
    : "<li>🎉 Everyone is present!</li>";

  absentDialog.showModal();
});

downloadBtn.addEventListener("click", () => {
  const present = JSON.parse(localStorage.getItem("attendance") || "[]");
  const presentNames = present.map(p => p.name);
  const absentees = knownNames.filter(name => !presentNames.includes(name));

  let content = "📋 Attendance Report\n\nPresent:\n";
  present.forEach(p => content += `✔ ${p.name} at ${p.time}\n`);
  content += `\nAbsent:\n`;
  absentees.forEach(name => content += `✘ ${name}\n`);

  const blob = new Blob([content], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Attendance-${new Date().toLocaleDateString().replace(/\//g, '-')}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
