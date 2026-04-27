import {registerNode} from '../../registry.js'

/**
 * HRTF — minimal head-related transfer function. Positions a (typically
 * mono) source on the horizontal plane around the listener, producing
 * a stereo output with three psycho-acoustic cues:
 *
 *   • ITD (interaural time difference) — sub-millisecond delay between
 *     ears, up to ~0.7 ms at full side, implemented as fractional reads
 *     from short ring buffers (linear interpolation between adjacent
 *     samples, so panning is click-free as the angle sweeps).
 *
 *   • Head shadow — a one-pole lowpass on the far ear whose cutoff drops
 *     from ~22 kHz at centre to ~3 kHz at the side. This is the dull
 *     muffled quality you hear in your far ear when a sound is hard
 *     beside you.
 *
 *   • ILD (interaural level difference) — a small attenuation (~3 dB at
 *     full side) of the far ear, on top of the head shadow.
 *
 * Distance applies a 1/(d+1) gain falloff. This is not a physically
 * accurate HRTF (no elevation, no individualised pinna response), but
 * it places sources convincingly enough for spatial mixing and is fully
 * sample-accurate so azimuth automation produces smooth Doppler-style
 * sweeps.
 *
 * Input is collapsed to mono ((L + R) / 2) before processing — HRTF
 * positions a single source. To position a true stereo image, run two
 * HRTFs at different angles and Mix them.
 */

const ITD_BUFFER_SAMPLES = 256  // ~5.3 ms at 48k — plenty of headroom
                                 //   over the ~0.7 ms max ITD.

registerNode({
    slug: 'audio-hrtf',
    icon: '👂',
    label: 'HRTF',
    tooltip: '3D positional audio (azimuth + distance). Head-shadow lowpass, interaural time/level differences. Mono source → stereo.',
    workspaceType: 'audio',

    input: {
        'audio':    {label: 'Audio',    type: 'audio', control: null},
        'azimuth':  {label: 'Azimuth',  type: 'audio', control: {default: 0,   min: -1, max: 1,  step: 0.001, smoothMs: 20}},
        'distance': {label: 'Distance', type: 'audio', control: {default: 0.0, min: 0,  max: 10, step: 0.01,  smoothMs: 20}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return {l: ctx.state('outL'), r: ctx.state('outR')} }
        }
    },

    audioState: {
        bufL: {type: 'ring', samples: ITD_BUFFER_SAMPLES},
        bufR: {type: 'ring', samples: ITD_BUFFER_SAMPLES},
        // Head-shadow lowpass state, one per ear.
        lpL: 0,
        lpR: 0,
        outL: 0,
        outR: 0
    },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const az = ctx.inL('azimuth')
        const dist = ctx.inL('distance')
        const rL = ctx.ring('bufL')
        const rR = ctx.ring('bufR')
        const lpL = ctx.state('lpL'), lpR = ctx.state('lpR')
        const outL = ctx.state('outL'), outR = ctx.state('outR')

        ctx.line(`
            const _mono = ((${a.l}) + (${a.r})) * 0.5;

            // Push first so the just-collected sample sits at offset 1
            // in the ring. With the linear-interp read below using
            // offset (_i + 1), a zero ITD ( _d = 0 ) returns _mono
            // directly — no branch, no off-by-one, continuous as the
            // azimuth sweeps through centre. Without this the if/else
            // form clicked at the zero-crossing because read(0) lands
            // on the cell about to be overwritten (one full buffer
            // length stale), not on the live mono sample.
            ${rL.push('_mono')}
            ${rR.push('_mono')}

            // Azimuth in [-1, 1] → angle in [-π/2, π/2]. Negative is left.
            const _angle = Math.max(-1, Math.min(1, ${az})) * HALF_PI;
            const _sinAz = Math.sin(_angle);
            const _absSin = Math.abs(_sinAz);

            // ITD: max ~0.7 ms shifts the contralateral ear later. The
            // ternary picks the side, but _itdSamp is itself zero at
            // sinAz=0, so _dL and _dR are both zero (and so equal) at
            // the crossover — no discontinuity in the delay length as
            // the source crosses centre.
            const _itdSamp = _absSin * 0.0007 * sampleRate;
            const _dL = _sinAz > 0 ? _itdSamp : 0;
            const _dR = _sinAz < 0 ? _itdSamp : 0;

            // Linear-interp ring read at offset (_i + 1) so _d = 0
            // returns the live _mono and _d = N returns the sample
            // pushed N iterations ago. Continuous in _d.
            const _iL = _dL | 0; const _fL = _dL - _iL;
            const _iR = _dR | 0; const _fR = _dR - _iR;
            const _sL0 = ${rL.read('(_iL + 1)')};
            const _sL1 = ${rL.read('(_iL + 2)')};
            const _sR0 = ${rR.read('(_iR + 1)')};
            const _sR1 = ${rR.read('(_iR + 2)')};
            const _delL = _sL0 + (_sL1 - _sL0) * _fL;
            const _delR = _sR0 + (_sR1 - _sR0) * _fR;

            // Head shadow: a per-ear one-pole lowpass whose cutoff drops
            // on the contralateral side only — near ear stays at ~22 kHz
            // (effectively bypass), far ear glides down to ~3 kHz at
            // full side. The cutoff selection is sided by sinAz, but
            // _fcFar reduces to _fcNear (= 22 kHz) at sinAz=0, so the
            // _kLPFar branch is numerically identical to the _kLPNear
            // branch right at the crossover — the swap doesn't click.
            const _fcNear = 22000;
            const _fcFar  = 22000 - _absSin * 19000;
            const _kLPNear = 1 - Math.exp(-TAU * _fcNear / sampleRate);
            const _kLPFar  = 1 - Math.exp(-TAU * _fcFar  / sampleRate);
            const _kL = _sinAz > 0 ? _kLPFar : _kLPNear;
            const _kR = _sinAz < 0 ? _kLPFar : _kLPNear;
            ${lpL} += (_delL - ${lpL}) * _kL;
            ${lpR} += (_delR - ${lpR}) * _kR;

            // ILD: continuous attenuation of the contralateral ear.
            // Math.max(0, ±sinAz) gives 0 on the ipsilateral side and
            // |sinAz| on the contralateral side, so each gain is C¹ in
            // sinAz — no discontinuity at zero.
            const _gL = 1 - Math.max(0,  _sinAz) * 0.3;
            const _gR = 1 - Math.max(0, -_sinAz) * 0.3;
            const _gain = 1 / (Math.max(0, ${dist}) + 1);

            // Always read from lpL/lpR — when an ear is "near" its
            // lowpass cutoff is at ~22 kHz, so lpL ≈ _delL and the
            // shadow is effectively bypass. Avoids the dry-vs-shadow
            // branch swap that the previous version did at the
            // zero-crossing.
            ${outL} = ${lpL} * _gain * _gL;
            ${outR} = ${lpR} * _gain * _gR;
        `)
    }
})
