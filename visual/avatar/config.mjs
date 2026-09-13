// Set only after the original/licensed Pink model has been reviewed.
// No model is shipped or downloaded while url is null.
export const avatarConfig = Object.freeze({
  url:null,
  license:'',
  source:'',
  scale:1,
  position:[0,-1.8,0],
  bones:{},
  animations:{},
  morphs:{
    blink:['blink'],blinkLeft:['eyeBlinkLeft'],blinkRight:['eyeBlinkRight'],
    mouthOpen:['mouthOpen','jawOpen'],smile:['mouthSmileLeft','mouthSmileRight'],
    aa:['viseme_aa'],ee:['viseme_E'],ih:['viseme_I'],oh:['viseme_O'],ou:['viseme_U']
  }
});
