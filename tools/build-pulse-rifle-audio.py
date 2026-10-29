import math, struct, wave

# Original short synthesized pulse; six audio voices accommodate 10 shots per second.
rate = 44100
with wave.open('public/assets/audio/gameplay/weapons/fire-pulse-rifle.wav', 'wb') as f:
    f.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    data = []
    for n in range(int(rate * .16)):
        t = n / rate
        phase = 2 * math.pi * (1500 * t - 2900 * t*t)
        envelope = min(1, t/.002) * math.exp(-t * 34) * min(1, (.16-t)/.025)
        sample = envelope * (.65 * math.sin(phase) + .22 * math.sin(phase * 2.03))
        data.append(struct.pack('<h', int(sample * 20000)))
    f.writeframes(b''.join(data))
