export const CONSTANTS=Object.freeze({
  c:299792458,
  G:6.67430e-11,
  h:6.62607015e-34,
  hbar:1.054571817e-34,
  elementaryCharge:1.602176634e-19
});
const finite=(v,n)=>{const x=Number(v);if(!Number.isFinite(x))throw new TypeError(n+' must be finite');return x;};
export function massEnergy(massKg){const m=finite(massKg,'massKg');return {joules:m*CONSTANTS.c**2,equation:'E = mc²'};}
export function gravitationalForce({mass1Kg,mass2Kg,distanceM}){
 const m1=finite(mass1Kg,'mass1Kg'),m2=finite(mass2Kg,'mass2Kg'),r=finite(distanceM,'distanceM');
 if(r<=0)throw new RangeError('distanceM must be > 0');
 return {newtons:CONSTANTS.G*m1*m2/(r*r),equation:'F = G m₁m₂/r²'};
}
export function schwarzschildRadius(massKg){const m=finite(massKg,'massKg');return {meters:2*CONSTANTS.G*m/CONSTANTS.c**2,equation:'rₛ = 2GM/c²'};}
export function lorentzFactor(speedMps){const v=Math.abs(finite(speedMps,'speedMps'));if(v>=CONSTANTS.c)throw new RangeError('|v| must be < c');return 1/Math.sqrt(1-(v*v)/(CONSTANTS.c**2));}
export function orbitalVelocity({centralMassKg,radiusM}){const M=finite(centralMassKg,'centralMassKg'),r=finite(radiusM,'radiusM');if(r<=0)throw new RangeError('radiusM must be > 0');return {metersPerSecond:Math.sqrt(CONSTANTS.G*M/r),model:'Newtonian circular orbit'};}
