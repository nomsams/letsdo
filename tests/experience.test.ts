import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaNeeds, invitationFromLink, friendlyProblem } from '../src/experience.ts';

test('the camera-help caller shares video while the helper only grants microphone access',()=>{
 assert.equal(mediaNeeds('guided','camera').camera,true);
 assert.equal(mediaNeeds('guided','guide').camera,false);
 for(const role of ['camera','guide'] as const){assert.equal(mediaNeeds('voice',role).camera,false);assert.equal(mediaNeeds('video',role).camera,true);}
});
test('pasted invitations must belong to this app and contain the complete private key',()=>{
 const key='b'.repeat(64),base='https://nomsams.github.io/letsdo/';
 assert.deepEqual(invitationFromLink(`${base}#call=alex&key=${key}`,base),{peer:'alex',token:key});
 assert.equal(invitationFromLink(`https://other.example/letsdo/#call=alex&key=${key}`,base),null);
 assert.equal(invitationFromLink(`https://nomsams.github.io/other/#call=alex&key=${key}`,base),null);
 assert.equal(invitationFromLink(`${base}#call=alex&key=partial`,base),null);
});
test('permission and expired-link failures offer specific next steps instead of technical codes',()=>{
 assert.match(friendlyProblem('Camera or microphone permission was denied').detail,/allow the microphone and camera/i);
 assert.match(friendlyProblem('This invitation has expired').detail,/fresh invitation/i);
 assert.match(friendlyProblem('Media connection failed. TURN relay').detail,/both devices are online/i);
 assert.equal(friendlyProblem('Call ended. Your camera and microphone are off.').title,'Your call has ended');
});
