import assert from 'node:assert/strict';
import {PinkSpatialKernel} from '../packages/spatial-kernel/index.mjs';
import {PinkSpatialPresence} from '../apps/next/spatial-presence.mjs';
const spatial=new PinkSpatialKernel();const p=new PinkSpatialPresence({runtime:{spatial},videoResolver:()=>null});
const pose=p.poseFromLandmarks([{x:.4,y:.4},{x:.6,y:.6},{x:.45,y:.55}]);
assert.ok(pose);assert.ok(Math.abs(pose.x)<.01);assert.ok(Math.abs(pose.y)<.01);
spatial.setCameraPermission('granted');spatial.setHeadPose(pose);assert.equal(spatial.snapshot().pose.source,'camera');
p.disable({stopCamera:false});assert.equal(spatial.snapshot().cameraPermission,'stopped');
console.log('Pink V24 Camera Spatial Presence contracts: PASS');
