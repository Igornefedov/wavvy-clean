const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const pool = require("../db");
const authorize = require("../middleware/authorize");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
require("dotenv").config();

// reset password logic: https://itnext.io/password-reset-emails-in-your-react-app-made-easy-with-nodemailer-bb27968310d7

router.post("/forgot-password", async (req, res) => {
	const email = req.body.email;

	try {
		const user = await pool.query("SELECT * FROM users WHERE user_email = $1", [
			email,
		]);

		if (email == "") {
			return res.status(401).json({ email: "Please do not leave email empty" });
		}

		if (user.rows.length === 0) {
			return res
				.status(401)
				.json({ email: "The email you entered does not exist" });
		}

		const user_id = user.rows[0].user_id;

		const token = await crypto.randomBytes(20).toString("hex");
		const tokenExpiration = (await Date.now()) + 3600000;

		pool.query(
			`UPDATE users SET
			reset_password_token = $1, 
			reset_password_expires = $2 
			WHERE user_email = $3`,
			[token, tokenExpiration, email]
			// (q_err, q_res) => {
			// 	res.json(q_res.rows);
			// }
		);

		const transporter = nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: `${process.env.EMAIL_ADDRESS}`,
				pass: `${process.env.EMAIL_PASSWORD}`,
			},
		});

		const mailOptions = {
			from: "toshvelaga@gmail.com",
			to: email,
			subject: "Link To Reset Password",
			text:
				"You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n" +
				"Please click on the following link, or paste this into your browser to complete the process within one hour of receiving it:\n\n" +
				`http://localhost:3000/${user_id}/reset/${token}\n\n` +
				"If you did not request this, please ignore this email and your password will remain unchanged.\n",
		};

		transporter.sendMail(mailOptions, (err, response) => {
			if (err) {
				console.error("there was an error: ", err);
			} else {
				res.status(200).json({
					success: "recovery email sent",
				});
			}
		});
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

router.get("/reset/:token", async (req, res, next) => {
	const token = req.params.token;
	const currentTime = Date.now();

	try {
		const user = await pool.query(
			`SELECT * FROM users 
			WHERE reset_password_token = $1`,
			[token]
		);

		if (
			user.rows.length === 0 ||
			user.rows[0].reset_password_expires < currentTime
		) {
			console.log("Invalid User Token");
			return res.json("Invalid or Expired Token");
		} else {
			res.status(200).send({
				user_id: user.rows[0].user_id,
				message: "password link works",
			});
		}
	} catch (error) {
		console.log(error);
	}
});

router.patch("/reset/new-password", async (req, res) => {
	const { user_id, newpassword, newpassword2 } = req.body;
	try {
		if (newpassword !== newpassword2) {
			return res.status(401).json({ password: "Passwords do not match" });
		}

		if (newpassword == "" || newpassword2 == "") {
			return res
				.status(401)
				.json({ password: "Please do not leave password field empty" });
		}

		const salt = await bcrypt.genSalt(10);
		const newBcryptPassword = await bcrypt.hash(newpassword, salt);

		pool.query(
			`UPDATE users SET user_password = $1 WHERE user_id = $2`,
			[newBcryptPassword, user_id],
			(q_err, q_res) => {
				console.log("passwords changed");
				res.json(q_res.rows);
			}
		);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
