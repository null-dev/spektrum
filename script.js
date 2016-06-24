class Util {
    //Check if a variable is a function
    static isFunction(v) {
        return typeof v === "function";
    }

    //Check if a variable is valid
    static isValid(v) {
        return v !== null && v !== undefined;
    }
}

//Simple enums!
class Enum {
    static create(arr) {
        var theEnum = {};
        arr.forEach(function (enumEntry) {
            if (!(enumEntry in theEnum)) {
                theEnum[enumEntry] = enumEntry;
            }
        });
        return Object.freeze(theEnum);
    }
}

var audioContext;
const SpectrumState = Enum.create([
    "IDLE",
    "DECODING",
    "RUNNING"
]);

//Error
function error(message, e) {
    var built = "[ERROR] " + message;
    if (Util.isValid(e)) {
        built = built + " " + e;
    }
    console.log(built);
}

//Get valid AudioContext and animation utils for this browser
window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;
window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || window.msCancelAnimationFrame;
try {
    audioContext = new AudioContext();
} catch (e) {
    error("Unsupported browser!", e);
}

function getCanvas() {
    return document.getElementById('canvas');
}

function setupSpectrum() {
    var spectrum = {};
    //Setup spectrum state
    spectrum.state = SpectrumState.IDLE;
    spectrum.setState = function (newState) {
        spectrum.state = newState;
        //Fire state change
        if (Util.isValid(spectrum.onStateChange) && Util.isFunction(spectrum.onStateChange)) {
            spectrum.onStateChange();
        }
    };
    spectrum.reCalc = function() {
        calcSpectrum(spectrum);
    };
    spectrum.tick = 0;
    spectrum.barWidth = 3;
    spectrum.barGap = 2;
    spectrum.totalBarWidth = spectrum.barWidth + spectrum.barGap;
    spectrum.glowColor = '#42b6ff';
    spectrum.particleGlowColor = /*'66,182,255'*/'255,255,255'; //MUST BE RGB, EXAMPLE: '255,67,78'
    spectrum.glowTo = 'transparent';
    spectrum.glowRadius = 10;
    spectrum.maxParticleGlowRadius = 10;
    spectrum.actualBarWidth = 3;
    //rgba(138, 199, 255, 1)
    spectrum.primaryGlowStartGrad = "rgba(100, 100, 100, 0.5)";
    spectrum.primaryGlowEndGrad = "rgba(50,50,50,0)";
    spectrum.primaryGlowColorStop = 1;
    spectrum.secondaryGlowStartGrad = "rgba(255,255,255,0.3)";
    spectrum.secondaryGlowEndGrad = "rgba(50,50,50,0)";
    spectrum.secondaryGlowColorStop = 0.2;
    spectrum.lightingScaleX = 10;
    spectrum.lightingScaleY = 10;
    spectrum.particles = [];
    spectrum.particleSpawnIncrement = 1;
    spectrum.perRunParticleSpawn = 4; //0 to disable particles
    spectrum.particleMovementSpeed = 2;
    spectrum.particleMovementSpeedValueDivisor = 20;
    spectrum.maxDiff = 5;
    spectrum.particleBoxSize = 2;
    spectrum.particleOpacityReductionSpeed = 0.01;
    spectrum.soundMin = 2;
    spectrum.multiplier = 1;
    spectrum.canvas = getCanvas();
    spectrum.fps = 0;
    spectrum.now = null;
    spectrum.lastUpdate = (new Date)*1;
    spectrum.updateFps = false;
    spectrum.flipBars = false;
    spectrum.flipParticles = false;
    spectrum.drawSecondaryGlow = true; //Disable this when side of the spectrum without bars is not visible (it will drastically improve performance)
    return spectrum;
}

//Play a song in the spectrum (arraybuffer)
function play(audioBuffer) {
    var spectrum = setupSpectrum();
    spectrum.setState(SpectrumState.DECODING);
    audioContext.decodeAudioData(audioBuffer, function (buffer) {
        //Ready to go!
        startSpectrum(spectrum, buffer)
    }, function (e) {
        error("Failed to decode audio!", e);
    });
    return spectrum;
}

function startSpectrum(spectrum, buffer) {
    spectrum.audioBufferSourceNode = audioContext.createBufferSource();
    spectrum.analyser = audioContext.createAnalyser();
    spectrum.audioBufferSourceNode.connect(spectrum.analyser);
    spectrum.analyser.connect(audioContext.destination);
    spectrum.audioBufferSourceNode.buffer = buffer;
    spectrum.audioBufferSourceNode.start();
    calcSpectrum(spectrum);
    var simpleDrawSpectrum = function () {
        drawSpectrum(spectrum);
        spectrum.requestId = requestAnimationFrame(simpleDrawSpectrum);
    };
    spectrum.requestId = requestAnimationFrame(simpleDrawSpectrum);
}

function calcSpectrum(spectrum) {
    spectrum.canvasWidth = spectrum.canvas.offsetWidth;
    spectrum.realCanvasWidth = spectrum.canvas.offsetWidth;
    spectrum.canvasHeight = spectrum.canvas.offsetHeight;
    spectrum.canvas.width = spectrum.canvasWidth;
    spectrum.canvas.height = spectrum.canvasHeight;
    spectrum.fakeCanvasX = -spectrum.canvasWidth;
    spectrum.canvasCentreY = Math.floor(spectrum.canvasHeight / 2);
    if(Util.isValid(spectrum.canvasCentreYOverride)) {
        spectrum.canvasCentreY = spectrum.canvasCentreYOverride;
    }
    spectrum.canvasCentreX = Math.floor(spectrum.canvasWidth / 2);
    var extraPadding = spectrum.canvasWidth % spectrum.totalBarWidth;
    spectrum.paddingLeft = Math.floor(extraPadding / 2) + 50;
    spectrum.paddingRight = spectrum.paddingLeft;
    spectrum.canvasWidth -= spectrum.paddingRight + spectrum.paddingLeft;
    spectrum.barCount = (spectrum.canvasWidth) / spectrum.totalBarWidth;
    spectrum.context = canvas.getContext('2d');
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function drawSpectrum(spectrum) {
    //Process and average out the required sound values
    var values = new Uint8Array(spectrum.analyser.frequencyBinCount);
    spectrum.analyser.getByteFrequencyData(values);
    var extraValues = values.length % spectrum.barCount;
    var perBarValueCount = (values.length - extraValues) / spectrum.barCount;
    var result = [];
    for (var a = 0; a < spectrum.barCount; a++) {
        var start = a * perBarValueCount;
        result.push(0);
        for (var b = 0; b < perBarValueCount; b++) {
            result[a] += values[start + b];
        }
        result[a] = Math.max(spectrum.soundMin, result[a]/perBarValueCount * spectrum.multiplier);
    }
    var context = spectrum.context;
    //Clear canvas
    context.clearRect(0, 0, spectrum.realCanvasWidth, spectrum.canvasHeight);
    //Let HTML draw background for now (maybe put this in later)
    // context.save();
    // drawBackground(spectrum);
    // context.restore();
    var i; //Don't define i like 50 times :/
    //Draw bars
    context.save();
    setupBarContext(spectrum);
    for (i = 0; i < result.length; i++) {
        resetTranslate(spectrum.context);
        context.translate(spectrum.paddingLeft + (i * spectrum.totalBarWidth), spectrum.canvasCentreY);
        drawBar(spectrum, result[i]);
    }
    context.restore();
    //Draw glow
    context.save();
    setupLightingContext(spectrum);
    for (i = 0; i < result.length; i++) {
        resetTranslate(spectrum.context);
        context.translate(/*spectrum.fakeCanvasX +*/ spectrum.paddingLeft + (i * spectrum.totalBarWidth), spectrum.canvasCentreY);
        drawLighting(spectrum, result[i]);
    }
    context.restore();
    //Update and draw particles
    if(spectrum.tick % spectrum.particleSpawnIncrement == 0) {
        for(i = 0; i < spectrum.perRunParticleSpawn; i++) {
            spawnParticle(spectrum, getRandomInt(spectrum.paddingLeft, spectrum.canvasWidth + spectrum.paddingRight), getRandomInt(0, spectrum.maxParticleGlowRadius));
        }
    }
    context.save();
    setupParticleContext(spectrum);
    updateParticles(spectrum);
    context.restore();
    if(spectrum.updateFps) {
        updateFps(spectrum);
    }
    spectrum.tick++;
}

function resetTranslate(context) {
    context.setTransform(1, 0, 0, 1, 0, 0);
}

function updateParticles(spectrum) {
    for(var i = spectrum.particles.length - 1; i >= 0 ; i--) {
        var particle = spectrum.particles[i];
        if(particle.y <= -spectrum.canvasHeight || particle.y >= spectrum.canvasHeight || particle.opacity <= 0) {
            spectrum.particles.splice(i, 1);
        } else {
            particle.y += Math.min(spectrum.maxDiff, (particle.y * spectrum.particleMovementSpeed)/spectrum.particleMovementSpeedValueDivisor);
            particle.opacity -= spectrum.particleOpacityReductionSpeed;
            drawParticle(spectrum, particle);
        }
    }
}
function setupParticleContext(spectrum) {
    spectrum.context.shadowOffsetY = 0;
}
function drawParticle(spectrum, particle) {
    var context = spectrum.context;
    context.shadowBlur = particle.glowRadius;
    // context.shadowOffsetX = spectrum.canvasWidth;
    context.shadowColor = "rgba(" + spectrum.particleGlowColor + "," + particle.opacity + ")";
    context.fillStyle = context.shadowColor;
    var realY;
    if(spectrum.flipParticles) {
        realY = spectrum.canvasCentreY + particle.y;
    } else {
        realY = spectrum.canvasCentreY - particle.y;
    }
    context.fillRect(/*spectrum.fakeCanvasX + */particle.x, realY, spectrum.particleBoxSize, spectrum.particleBoxSize);
}

//Not used!
function drawBackground(spectrum) {
    var context = spectrum.context;
    var radgrad = context.createRadialGradient(spectrum.canvasCentreX,
        spectrum.canvasCentreY,
        0,
        spectrum.canvasCentreX,
        spectrum.canvasCentreY,
        spectrum.canvasHeight);
    radgrad.addColorStop(0, '#275683');
    radgrad.addColorStop(1, 'rgba(0,0,0,1)');
    context.scale(spectrum.canvasWidth/spectrum.canvasHeight, 1);
    context.fillStyle = radgrad;
    context.fillRect(0,0,spectrum.canvasWidth,spectrum.canvasHeight);
}

function setupBarContext(spectrum) {
    var context = spectrum.context;
    context.shadowBlur = spectrum.glowRadius;
    // context.shadowOffsetX = spectrum.canvasWidth;
    context.shadowOffsetY = 0;
    context.shadowColor = spectrum.glowColor;
    context.fillStyle = "white";
}

function drawBar(spectrum, value) {
    var realValue;
    if(spectrum.flipBars) {
        realValue = -value;
    } else {
        realValue = value;
    }
    spectrum.context.fillRect(spectrum.barWidth, 0, spectrum.actualBarWidth, realValue);
}

function setupLightingContext(spectrum) {
    spectrum.context.globalCompositeOperation = "lighter";
}

function drawLighting(spectrum, value) {
    var context = spectrum.context;
    var realValue;
    if(spectrum.flipBars) {
        realValue = -value;
    } else {
        realValue = value;
    }
    var grad = context.createRadialGradient(0, 0, 0, 0, 0, value);
    grad.addColorStop(0, spectrum.primaryGlowStartGrad);
    // grad.addColorStop(0.2, "rgba(255,255,255,0)");
    grad.addColorStop(spectrum.primaryGlowColorStop, spectrum.primaryGlowEndGrad);
    context.fillStyle = grad;
    // context.fillStyle = "black";
    //context.setTransform(spectrum.lightingScaleX, 0, 0, spectrum.lightingScaleY, 0, 0);
    var width = spectrum.barWidth * spectrum.lightingScaleX;
    var widthDivTwo = width/2;
    context.fillRect(-widthDivTwo, 0, width, realValue * spectrum.lightingScaleY);
    if(spectrum.drawSecondaryGlow) {
        grad = context.createRadialGradient(0, 0, 0, 0, 0, value);
        grad.addColorStop(0, spectrum.secondaryGlowStartGrad);
        // grad.addColorStop(0.2, "rgba(255,255,255,0)");
        grad.addColorStop(spectrum.secondaryGlowColorStop, spectrum.secondaryGlowEndGrad);
        context.fillStyle = grad;
        context.fillRect(-widthDivTwo, 0, width, -realValue * spectrum.lightingScaleY);
    }
    //Attempt below is to get the lighting correct (to no avail and massive lag):/
    /*var grad = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, "rgba(0,255,255,0.01)");
    grad.addColorStop(1, "rgba(0,255,255,0)");
    context.fillStyle = grad;
    context.globalCompositeOperation = "multiply";
    // context.fillStyle="blue";
    context.scale(40, value * 1.5);
    context.fillRect(-20, -value, 40, value * 2 * 1.5);*/
}

function spawnParticle(spectrum, x, glowRadius) {
    var particle = {};
    particle.opacity = 1;
    particle.glowRadius = glowRadius;
    particle.x = x;
    particle.y = 2;
    spectrum.particles.push(particle);
}

function updateFps(spectrum) {
    var thisFrameFPS = 1000 / ((spectrum.now = new Date) - spectrum.lastUpdate);
    if (spectrum.now != spectrum.lastUpdate){
        spectrum.fps += thisFrameFPS - spectrum.fps;
        spectrum.lastUpdate = spectrum.now;
    }
}