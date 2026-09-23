import { LightningElement, api } from 'lwc';
export default class ChecklistCidp extends LightningElement {
    @api
    options = [{ label: "Ross", value: "option1" }, { label: "Rachel", value: "option2" }];
}