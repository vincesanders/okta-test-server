const router = require('express').Router();
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const users = require('../users/userModel');
const { generatePassword } = require('../utils/generatePassword');
const { generateToken } = require('../utils/generateToken');
const { jwtSecret } = require('../utils/secrets');

router.post('/login', (req, res) => {
    const loginInfo = {
        username: process.env.OKTA_USERNAME,
        password: process.env.OKTA_PASSWORD,
        options: {
            multiOptionalFactorEnroll: true,
            warnBeforePasswordExpired: true
        }
    }
    axios
    .post(`https://dev-833124.okta.com/api/v1/authn`, loginInfo)
    .then(Response => {
        console.log(Response);
        res.status(200).json(Response.data);
    })
    .catch(err => {
        res.status(500).json({error: err, message: 'Login with Okta failed.', step: 'api/auth/login'});
    });
});

//register user without email invite
router.post('/register', (req, res) => {
    const header = {
        headers: {
            Authorization: `SSWS ${process.env.OKTA_REGISTER_TOKEN_TEST}`
        }
    }
    const registerInfo = {
        profile: {
            firstName: "Testy",
            lastName: "McTestson",
            email: "mctestson@schematiccapture.com",
            login: "mctestson@schematiccapture.com"
        },
        groupIds: [
            //group id is in url in dashboard when you click on a group.
            "00g4ym8k0Wc6sGqCW4x6"
        ],
        credentials: {
            password : { value: 'Testing123!' },
            recovery_question: {
                question: "Who's a major player in the cowboy scene?",
                answer: "Annie Oakley"
            }
        }
    }

    axios
    .post(`https://dev-833124.okta.com/api/v1/users?activate=true`, registerInfo, header)
    .then(Response => {
        console.log(Response);
        res.status(200).json(Response.data);
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({error: err, message: 'Registration with Okta failed.', step: 'api/auth/resgister'});
    });
});

//register user with email invite
router.post('/invite', (req, res) => {
    //front-end sends technician email, roleId, full name as name
    //separate full name into first name and last name
    const [first, ...last] = req.body.name.split(' ');
    //convert role id to group id
    let groupId
    switch (req.body.roleId) {
        case 1:
            //These groupIds will be different for SchemCap's groups
            groupId = '00g4ym8nmTwfhWeEm4x6';
            break;
        case 2:
            groupId = '00g4ymzijCXBwLK2h4x6';
            break;
        default:
            groupId = '00g4ym8k0Wc6sGqCW4x6';
            break;
    }
    //generate a password
    const password = generatePassword(8);
    //generate security question and answer
    const answer = generatePassword(10);
    //send registration to Okta
    const header = {
        headers: {
            Authorization: `SSWS ${process.env.OKTA_REGISTER_TOKEN_TEST}`
        }
    }
    const registerInfo = {
        profile: {
            firstName: first,
            lastName: last,
            email: req.body.email,
            login: req.body.email
        },
        groupIds: [
            //group id is in url in dashboard when you click on a group.
            groupId
        ],
        credentials: {
            password : { value: password },
            recovery_question: {
                question: "Who's a major player in the cowboy scene?",
                answer: answer
            }
        }
    }
    axios
    .post(`https://dev-833124.okta.com/api/v1/users?activate=true`, registerInfo, header)
    .then(response => {
        //generate a token that contains the hashed password and security answer
        const token = generateToken(response.data.id, req.body.roleId, req.body.email, password, answer);
        //send an email that contains a link to sign-in with the token in the url
        const sgApiKey = process.env.SG_API_KEY;
        const templateId = process.env.SG_TEMPLATE_ID;
        const registrationUrl = `somethinglike.schematiccapture.com/firstregistration/${token}`;
        const config = {
            headers: {
                Authorization: `Bearer ${sgApiKey}`
            }
        };
        const data = {
            personalizations: [
                {
                    to: [{ email: req.body.email, name: req.body.name }],
                    dynamic_template_data: { registrationUrl, token }
                }
            ],
            from: {
                email: "invitation@schematiccapture.com",
                name: "Schematic Capture"
            },
            template_id: templateId
        };
        axios
        .post("https://api.sendgrid.com/v3/mail/send", data, config)
        .then(() => console.log(`successfully sent invitation to ${email}`))
        .catch(error => console.log(error));
        console.log(response);
        res.status(200).json(response.data);
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ 
            error: err, 
            message: 'Failed to register to new user with Okta.', 
            step: 'api/auth/invite'
        });
    });
        //upon first sign in, user must change password and security question
        //front-end will send
            //1 new password
            //2 new security question and answer
            //3 token from url
    //make an api call to change password and security question
});

router.post('/changepasswordandquestion', (req, res) => {
    //front-end will send
        //1 new password
        //2 new security question and answer
        //3 token from url
    const { newPassword, newQuestion, newAnswer } = req.body;
    //decode token
    let token;
    jwt.verify(req.body.token, jwtSecret, (err, decodedToken) => {
        if (err) {
            res.status(401).json({ message: 'Invalid token' });
        } else {
            token = decodedToken;
        }
    });
    //make an api call to change password
    const header = {
        headers: {
            Authorization: `SSWS ${process.env.OKTA_REGISTER_TOKEN_TEST}`
        }
    }
    const passwordInfo = {
        oldPassword: token.password,
        newPassword: newPassword
    }
    const questionInfo = {
        password: { value: newPassword },
        recovery_question: {
            question: newQuestion,
            answer: newAnswer
        }
    }
    const loginInfo = {
        username: token.email,
        password: newPassword,
        options: {
            multiOptionalFactorEnroll: true,
            warnBeforePasswordExpired: true
        }
    }
    axios
    .post(`https://dev-833124.okta.com/api/v1/users/${token.id}/credentials/change_password`, passwordInfo, header)
    .then(response => {
        console.log(response);
        //make an api call to change security question and answer
        return axios
        .post(`https://dev-833124.okta.com/api/v1/users/${token.id}/credentials/change_recovery_question`, questionInfo, header)
    })
    .then(response => {
        console.log(response);
        //log user in
        return axios.post(`https://dev-833124.okta.com/api/v1/authn`, loginInfo)
    })
    .then(response => {
        console.log(response);
        res.status(200).json(response.data);
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({error: err, message: 'Failed to change password and security question.', step: 'api/auth/changepassword'});
    });
})

//Do not use - redirects you to okta
router.post('/forgotpassword', (req, res) => {
    const data = {
        username: "laughatothers@gmail.com",
        factorType: "EMAIL",
        relayState: "https://www.schematiccapture.com/"
    }
    axios
    .post('https://dev-833124.okta.com/api/v1/authn/recovery/password', data)
    .then(response => {
        res.status(200).json(response.data);
    })
    .catch(err => {
        res.status(500).json({error: err, message: 'Failed to reset password with Okta.', step: 'api/auth/forgotpassword'});
    })
});

//returns an array of security questions
router.get('/questions', (req, res) => {
    axios
    .get('https://dev-833124.okta.com/api/v1/users/00u4syc0frXBxcDtF4x6/factors/questions')
    .then(response => {
        res.status(200).json(response.data);
    })
    .catch(err => {
        res.status(500).json({error: err, message: 'Couldn\'t get recovery questions from Okta.', step: 'api/auth/questions'});
    })
});

module.exports = router;
//response when user is logged in
// {
//     "expiresAt": "2020-04-06T23:47:36.000Z",
//     "status": "SUCCESS",
//     "sessionToken": "20111q39he_TBbJvICswGhn6gwyVjgjAwyXnCgPsFRunaC9zKkJEf7a",
//     "_embedded": {
//         "user": {
//             "id": "00u4syc0frXBxcDtF4x6",
//             "passwordChanged": "2020-03-24T21:11:57.000Z",
//             "profile": {
//                 "login": "vincesanders@hotmail.com",
//                 "firstName": "Vincent",
//                 "lastName": "Sanders",
//                 "locale": "en",
//                 "timeZone": "America/Los_Angeles"
//             }
//         }
//     },
//     "_links": {
//         "cancel": {
//             "href": "https://dev-833124.okta.com/api/v1/authn/cancel",
//             "hints": {
//                 "allow": [
//                     "POST"
//                 ]
//             }
//         }
//     }
// }

//response when user is created
// {
//     "id": "00u4ymqp0GFLE6XdY4x6",
//     "status": "ACTIVE",
//     "created": "2020-03-26T17:48:41.000Z",
//     "activated": "2020-03-26T17:48:41.000Z",
//     "statusChanged": "2020-03-26T17:48:41.000Z",
//     "lastLogin": null,
//     "lastUpdated": "2020-03-26T17:48:41.000Z",
//     "passwordChanged": "2020-03-26T17:48:41.000Z",
//     "profile": {
//         "firstName": "Testy",
//         "lastName": "McTestson",
//         "mobilePhone": null,
//         "secondEmail": null,
//         "login": "mctestson@schematiccapture.com",
//         "email": "mctestson@schematiccapture.com"
//     },
//     "credentials": {
//         "password": {},
//         "emails": [
//             {
//                 "value": "mctestson@schematiccapture.com",
//                 "status": "VERIFIED",
//                 "type": "PRIMARY"
//             }
//         ],
//         "recovery_question": {
//             "question": "Who's a major player in the cowboy scene?"
//         },
//         "provider": {
//             "type": "OKTA",
//             "name": "OKTA"
//         }
//     },
//     "_links": {
//         "suspend": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/lifecycle/suspend",
//             "method": "POST"
//         },
//         "resetPassword": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/lifecycle/reset_password",
//             "method": "POST"
//         },
//         "forgotPassword": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/credentials/forgot_password",
//             "method": "POST"
//         },
//         "expirePassword": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/lifecycle/expire_password",
//             "method": "POST"
//         },
//         "changeRecoveryQuestion": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/credentials/change_recovery_question",
//             "method": "POST"
//         },
//         "self": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6"
//         },
//         "changePassword": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/credentials/change_password",
//             "method": "POST"
//         },
//         "deactivate": {
//             "href": "https://dev-833124.okta.com/api/v1/users/00u4ymqp0GFLE6XdY4x6/lifecycle/deactivate",
//             "method": "POST"
//         }
//     }
// }