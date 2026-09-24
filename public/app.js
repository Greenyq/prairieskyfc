fetch("/api/dashboard").then(r=>r.json()).then(d=>{
 const items=[["Players",d.players],["Paid",d.paid],["Unpaid",d.unpaid],["October trials",d.trials],["Waiting reply",d.waiting]];
 document.querySelector("#cards").innerHTML=items.map(([k,v])=>`<div class="card"><span>${k}</span><b>${v}</b></div>`).join("");
});