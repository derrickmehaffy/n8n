import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription
} from 'n8n-workflow';

import {
	listFields,
	listOperations,
} from './ListDescription';

import {
	contactFields,
	contactOperations
} from './ContactDescription';

import {
	mailFields,
	mailOperations,
	SendMailBody,
} from './MailDescription';

import {
	sendGridApiRequest,
	sendGridApiRequestAllItems,
} from './GenericFunctions';

export class SendGrid implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SendGrid',
		name: 'sendGrid',
		icon: 'file:sendGrid.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ":" + $parameter["resource"]}}',
		description: 'Consume SendGrid API',
		defaults: {
			name: 'SendGrid',
			color: '#1A82E2',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'sendGridApi',
				required: true,
			},
		],
		properties: [
			// Node properties which the user gets displayed and
			// can change on the node.
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Contact',
						value: 'contact',
					},
					{
						name: 'List',
						value: 'list',
					},
					{
						name: 'Mail',
						value: 'mail',
					},
				],
				default: 'list',
				required: true,
				description: 'Resource to consume',
			},
			...listOperations,
			...listFields,
			...contactOperations,
			...contactFields,
			...mailOperations,
			...mailFields,
		],
	};

	methods = {
		loadOptions: {
			// Get custom fields to display to user so that they can select them easily
			async getCustomFields(this: ILoadOptionsFunctions,):Promise<INodePropertyOptions[]>{
				const returnData: INodePropertyOptions[] = [];
				const { custom_fields } = await sendGridApiRequest.call(this, '/marketing/field_definitions', 'GET', {}, {});
				if (custom_fields !== undefined) {
					for (const customField of custom_fields){
						returnData.push({
							name: customField.name,
							value: customField.id,
						});
					}
				}
				return returnData;
			},
			// Get lists to display to user so that they can select them easily
			async getListIds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const lists = await sendGridApiRequestAllItems.call(this, `/marketing/lists`, 'GET', 'result', {}, {});
				for (const list of lists) {
					returnData.push({
						name: list.name,
						value: list.id,
					});
				}
				return returnData;
			},
			async getTemplateIds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await sendGridApiRequest.call(this, '/templates', 'GET', {}, { generations: 'dynamic' });
				return responseData.templates.map(({ id, name }: { id: string, name: string }) => ({ name, value: id }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const length = (items.length as unknown) as number;
		const qs: IDataObject = {};
		let responseData;
		const returnData: IDataObject[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		// https://sendgrid.com/docs/api-reference/
		if (resource === 'contact') {
			if (operation === 'getAll') {
				for (let i = 0; i < length; i++) {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const filters = this.getNodeParameter('filters', i) as IDataObject;
					let endpoint = '/marketing/contacts';
					let method = 'GET';
					const body: IDataObject = {};
					if (filters.query && filters.query !== '') {
						endpoint = '/marketing/contacts/search';
						method = 'POST';
						Object.assign(body, { query: filters.query });
					}
					responseData = await sendGridApiRequestAllItems.call(this, endpoint, method, 'result', body, qs);
					if (returnAll === false) {
						const limit = this.getNodeParameter('limit', i) as number;
						responseData = responseData.splice(0, limit);
					}
					returnData.push.apply(returnData, responseData);
				}
			}
			if (operation === 'get') {
				const by = this.getNodeParameter('by', 0) as string;
				let endpoint;
				let method;
				const body: IDataObject = {};
				for (let i = 0; i < length; i++) {
					if (by === 'id') {
						method = 'GET';
						const contactId = this.getNodeParameter('contactId', i) as string;
						endpoint = `/marketing/contacts/${contactId}`;
					} else {
						const email = this.getNodeParameter('email', i) as string;
						endpoint = '/marketing/contacts/search';
						method = 'POST';
						Object.assign(body, { query: `email LIKE '${email}' `});
					}
					responseData = await sendGridApiRequest.call(this, endpoint, method, body, qs);
					responseData = responseData.result || responseData;
					if (Array.isArray(responseData)) {
						responseData = responseData[0];
					}
					returnData.push(responseData);
				}
			}
			if (operation === 'upsert') {
				const contacts = [];
				for (let i = 0; i < length; i++) {
					const email = this.getNodeParameter('email',i) as string;
					const additionalFields = this.getNodeParameter(
						'additionalFields',
						i,
					) as IDataObject;
					const contact: IDataObject = {
						email,
					};
					if (additionalFields.addressUi) {
						const addressValues = (additionalFields.addressUi as IDataObject).addressValues as IDataObject;
						const addressLine1 = addressValues.address1 as string;
						const addressLine2 = addressValues.address2 as string;
						if (addressLine2){
							Object.assign(contact, { address_line_2: addressLine2 });
						}
						Object.assign(contact, { address_line_1: addressLine1 });
					}
					if (additionalFields.city) {
						const city = additionalFields.city as string;
						Object.assign(contact, { city });
					}
					if (additionalFields.country) {
						const country = additionalFields.country as string;
						Object.assign(contact, { country });
					}
					if (additionalFields.firstName) {
						const firstName = additionalFields.firstName as string;
						Object.assign(contact, { first_name: firstName });
					}
					if (additionalFields.lastName) {
						const lastName = additionalFields.lastName as string;
						Object.assign(contact, { last_name:lastName});
					}
					if (additionalFields.postalCode) {
						const postalCode = additionalFields.postalCode as string;
						Object.assign(contact, { postal_code: postalCode });
					}
					if (additionalFields.stateProvinceRegion) {
						const stateProvinceRegion = additionalFields.stateProvinceRegion as string;
						Object.assign(contact, { state_province_region: stateProvinceRegion });
					}
					if (additionalFields.alternateEmails) {
						const alternateEmails = ((additionalFields.alternateEmails as string).split(',') as string[]).filter(email => !!email);
						if (alternateEmails.length !== 0) {
							Object.assign(contact, { alternate_emails: alternateEmails });
						}
					}
					if (additionalFields.listIdsUi) {
						const listIdValues = (additionalFields.listIdsUi as IDataObject).listIdValues as IDataObject;
						const listIds = listIdValues.listIds as IDataObject[];
						Object.assign(contact, { list_ids: listIds });
					}
					if (additionalFields.customFieldsUi) {
						const customFields = (additionalFields.customFieldsUi as IDataObject).customFieldValues as IDataObject[];
						if (customFields) {
							const data = customFields.reduce((obj, value) => Object.assign(obj, { [`${value.fieldId}`]: value.fieldValue }), {});
							Object.assign(contact, { custom_fields: data });
						}
					}
					contacts.push(contact);
				}
				responseData = await sendGridApiRequest.call(this, '/marketing/contacts', 'PUT', { contacts }, qs);

				returnData.push(responseData);
			}
			if (operation === 'delete') {
				for (let i = 0; i < length; i++) {
					const deleteAll = this.getNodeParameter('deleteAll', i) as boolean;
					if(deleteAll === true) {
						qs.delete_all_contacts = 'true';
					}
					qs.ids = (this.getNodeParameter('ids',i) as string).replace(/\s/g, '');
					responseData = await sendGridApiRequest.call(this, `/marketing/contacts`, 'DELETE', {}, qs);
					returnData.push(responseData);
				}
			}
		}
		if (resource === 'list') {
			if (operation === 'getAll'){
				for (let i = 0; i < length; i++) {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					responseData = await sendGridApiRequestAllItems.call(this, `/marketing/lists`, 'GET', 'result', {}, qs);
					if (returnAll === false) {
						const limit = this.getNodeParameter('limit', i) as number;
						responseData = responseData.splice(0, limit);
					}
					returnData.push.apply(returnData, responseData);
				}
			}
			if (operation === 'get') {
				for (let i = 0; i < length; i++) {
					const listId = this.getNodeParameter('listId',i) as string;
					qs.contact_sample = this.getNodeParameter('contactSample', i) as boolean;
					responseData = await sendGridApiRequest.call(this, `/marketing/lists/${listId}`, 'GET', {}, qs);
					returnData.push(responseData);
				}
			}
			if (operation === 'create') {
				for (let i = 0; i < length; i++) {
					const name = this.getNodeParameter('name',i) as string;
					responseData = await sendGridApiRequest.call(this, '/marketing/lists', 'POST', { name }, qs);
					returnData.push(responseData);
				}
			}
			if (operation === 'delete') {
				for (let i = 0; i < length; i++) {
					const listId = this.getNodeParameter('listId',i) as string;
					qs.delete_contacts = this.getNodeParameter('deleteContacts', i) as boolean;
					responseData = await sendGridApiRequest.call(this, `/marketing/lists/${listId}`, 'DELETE', {}, qs);
					responseData = { success: true };
					returnData.push(responseData);
				}
			}
			if (operation=== 'update'){
				for (let i = 0; i < length; i++) {
					const name = this.getNodeParameter('name',i) as string;
					const listId = this.getNodeParameter('listId',i) as string;
					responseData = await sendGridApiRequest.call(this, `/marketing/lists/${listId}`, 'PATCH', { name }, qs);
					returnData.push(responseData);
				}
			}
		}
		if (resource === 'mail') {
			if (operation === 'send') {
				for (let i = 0; i < length; i++) {

					const toEmail = this.getNodeParameter('toEmail', i) as string;

					const parsedToEmail = toEmail.includes(',')
						? toEmail.split(',').map((i) => ({ email: i.trim() }))
						: [{ email: toEmail.trim() }];

					const { bccEmail, ccEmail, enableSandbox } = this.getNodeParameter('additionalFields', i) as {
						bccEmail: string;
						ccEmail: string;
						enableSandbox: boolean,
					};

					const body: SendMailBody = {
						personalizations: [{
							to: parsedToEmail,
							subject: this.getNodeParameter('subject', i) as string,
						}],
						from: {
							email: (this.getNodeParameter('fromEmail', i) as string).trim(),
							name: this.getNodeParameter('fromName', i) as string,
						},
						mail_settings: {
							sandbox_mode: {
								enable: enableSandbox,
							},
						},
					};

					const dynamicTemplateEnabled = this.getNodeParameter('dynamicTemplate', i);

					// dynamic template
					if (dynamicTemplateEnabled) {
						body.template_id = this.getNodeParameter('templateId', i) as string;

						const { fields } = this.getNodeParameter('dynamicTemplateFields', i) as {
							fields: Array<{ [key: string]: string }>
						};

						if (fields) {
							fields.forEach(field => {
								body.personalizations[0].dynamic_template_data = {
									[field.key]: field.value,
								};
							});
						}

					// message body
					} else {
						body.content = [{
							type: this.getNodeParameter('contentType', i) as string,
							value: this.getNodeParameter('contentValue', i) as string,
						}];
					}

					if (bccEmail) {
						body.personalizations[0].bcc = bccEmail.split(',').map(i => ({ email: i.trim() }));
					}

					if (ccEmail) {
						body.personalizations[0].cc = ccEmail.split(',').map(i => ({ email: i.trim() }));
					}

					await sendGridApiRequest.call(this, '/mail/send', 'POST', body, qs);
					returnData.push({ success: true });
				}
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
