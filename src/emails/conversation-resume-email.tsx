import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type ConversationResumeEmailProps = {
  visitorName: string;
  profileName: string;
  resumeUrl: string;
};

export function ConversationResumeEmail({
  visitorName,
  profileName,
  resumeUrl,
}: ConversationResumeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Keep your PartnerBird conversation with {profileName}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>PartnerBird</Text>
          <Heading style={headingStyle}>Your conversation is ready to continue</Heading>
          <Text style={copyStyle}>Hi {visitorName},</Text>
          <Text style={copyStyle}>
            Use this private link to return to your conversation with {profileName} from
            this device or another one. Opening it also verifies your email so PartnerBird
            can notify you when {profileName} replies.
          </Text>
          <Section style={buttonSectionStyle}>
            <Button href={resumeUrl} style={buttonStyle}>
              Continue conversation
            </Button>
          </Section>
          <Text style={mutedStyle}>
            This link expires in 30 days. Do not forward it—it provides access to your
            conversation.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  margin: 0,
  backgroundColor: "#f4f5f7",
  color: "#17191d",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const containerStyle = {
  margin: "32px auto",
  maxWidth: "560px",
  border: "1px solid #dfe3e8",
  borderRadius: "18px",
  backgroundColor: "#ffffff",
  padding: "34px",
};

const brandStyle = {
  margin: "0 0 22px",
  color: "#138a4a",
  fontSize: "15px",
  fontWeight: 700,
  letterSpacing: "-0.2px",
};

const headingStyle = {
  margin: "0 0 18px",
  color: "#17191d",
  fontSize: "28px",
  lineHeight: "34px",
  letterSpacing: "-0.8px",
};

const copyStyle = {
  margin: "0 0 14px",
  color: "#454a52",
  fontSize: "15px",
  lineHeight: "24px",
};

const buttonSectionStyle = { margin: "26px 0" };

const buttonStyle = {
  borderRadius: "10px",
  backgroundColor: "#138a4a",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 700,
  padding: "13px 20px",
  textDecoration: "none",
};

const mutedStyle = {
  margin: 0,
  color: "#767c85",
  fontSize: "12px",
  lineHeight: "19px",
};
