function dag(age) {
    let calcAgeDag = age * 365;

    return calcAgeDag;
}
let x = dag(22);

function uur(age) {
    let calcAgeUur = age * 8760;
    return calcAgeUur;
}
let y = uur(22);
console.log( y / 200 + " uren in een jaar. " +  x  + " dagen in een jaar");
