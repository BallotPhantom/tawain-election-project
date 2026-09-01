import math, random
from statistics import mean, pstdev, stdev, NormalDist
from datetime import datetime

def house_weight(tag):
    return 0.4 if tag in ('R', 'D') else 1.0

def recency_weight(poll_end_date, election_date):
    days = max(0, (election_date - poll_end_date).days)
    return math.exp(-days / 120)

# pollster -> (mode, confidence)  -- classified from general knowledge of each firm's methodology,
# same categories/spirit as Taiwan's pollster_method.json (mode: phone/online, confidence: high/medium/low/unknown)
POLLSTER_METHOD = {
    "SurveyUSA": ("online","high"), "The Trafalgar Group": ("online","medium"), "Trafalgar Group": ("online","medium"),
    "Emerson College": ("online","medium"), "Research Co.": ("online","medium"), "Data for Progress": ("online","medium"),
    "Quinnipiac University": ("phone","high"), "Marist College": ("phone","high"), "Siena College": ("phone","high"),
    "Public Policy Polling": ("phone","medium"), "Civiqs": ("online","medium"), "Change Research": ("online","medium"),
    "Mason-Dixon": ("phone","high"), "Selzer & Company": ("phone","high"), "Ipsos": ("online","high"),
    "HarrisX": ("online","medium"), "St. Pete Polls": ("phone","low"), "Cygnal": ("online","medium"),
    "Remington Research Group": ("phone","medium"), "Gravis Marketing": ("phone","medium"),
    "Susquehanna Polling & Research": ("phone","medium"), "InsiderAdvantage": ("online","low"),
    "Targoz Market Research": ("online","low"), "Data Orbital": ("online","low"), "co/efficient": ("online","low"),
    "Beacon Research": ("phone","medium"), "BSP Research": ("phone","medium"), "UT Tyler": ("phone","medium"),
    "Echelon Insights": ("online","medium"), "WPA Intelligence": ("phone","medium"),
    "Clarity Campaign Labs": ("online","medium"), "Blueprint Polling": ("online","low"),
    "FM3 Research": ("phone","medium"), "OpinionWorks": ("phone","medium"), "University of Maryland": ("phone","medium"),
    "Goucher College": ("phone","high"), "Victory Research": ("phone","low"),
    "Southern Illinois University": ("phone","medium"), "ALG Research": ("phone","medium"),
    "Research & Polling, Inc.": ("phone","medium"), "GQR Research": ("phone","medium"),
    "Probolsky Research": ("phone","medium"), "UC Berkeley": ("online","high"), "USC": ("online","high"),
    "Public Policy Institute of California": ("phone","high"), "ActiVote": ("online","low"),
    "MassINC": ("phone","high"), "Suffolk University": ("phone","high"),
    "Western New England University": ("phone","medium"), "UMass Lowell": ("phone","medium"),
    "Mitchell Research": ("phone","low"), "Glengariff Group": ("phone","medium"), "Target-Insyght": ("phone","low"),
    "EPIC-MRA": ("phone","high"), "Magellan Strategies": ("online","medium"),
    "Keating Research/OnSight Public Affairs/Martin Campaigns": ("phone","medium"),
    "University of Georgia": ("phone","medium"), "Opinion Savvy": ("online","low"),
    "University of Iowa": ("phone","medium"), "Embold Research": ("online","medium"),
    "St. Cloud State University": ("online","medium"), "CU Boulder/YouGov": ("online","high"),
    "University of Colorado/YouGov": ("online","high"), "Jayhawk Consulting": ("online","low"),
    "20/20 Insight": ("phone","low"), "University of Illinois Springfield": ("phone","medium"),
    "Osage Research": ("phone","low"), "Nelson Research": ("phone","low"), "CWS Research": ("phone","low"),
    "KAConsulting": ("phone","low"), "HighGround Inc.": ("phone","low"), "Wick Insights": ("phone","low"),
    "Fox News": ("phone","high"), "Baldwin Wallace University": ("phone","medium"), "Sacred Heart University": ("phone","medium"),
    "Marquette University": ("phone","high"), "Hoffman Research Group": ("phone","low"), "Research America Inc.": ("phone","low"),
    "Carroll Strategies": ("phone","low"), "Pacific Market Research": ("phone","low"),
    # --- additions for 2014 cycle + more 2018/2022 states ---
    "SEA Polling": ("phone","low"), "0ptimus": ("online","low"), "WPR/St. Norbert College": ("phone","medium"),
    "Crosswind Communications": ("phone","low"), "Survey Research Center": ("phone","low"), "Texas Lyceum": ("phone","medium"),
    "McKeon & Associates": ("phone","low"), "We Ask America": ("online","medium"), "APC Research": ("phone","low"),
    "Marketing Resource Group": ("phone","medium"), "CBS News/NYT/YouGov": ("online","high"), "YouGov": ("online","high"),
    "Zogby Analytics": ("online","medium"), "Rasmussen Reports": ("phone","medium"), "NBC News/Marist": ("phone","high"),
    "Monmouth University": ("phone","high"), "Monmouth": ("phone","high"), "Survey USA": ("online","high"),
    "Remington Research": ("phone","medium"), "UoT/Texas Tribune": ("online","high"),
    "Vox Populi Polling": ("online","low"), "WNEU": ("phone","medium"), "Boston Globe": ("phone","medium"),
    "UMass Amherst": ("phone","medium"), "WBUR/MassINC": ("phone","high"), "Gonzales Research": ("phone","medium"),
    "WPA Opinion Research": ("phone","medium"), "Baltimore Sun": ("phone","medium"), "Washington Post": ("phone","high"),
    "OnMessage, Inc.": ("phone","low"), "Muhlenberg College": ("phone","medium"), "Harper Polling": ("phone","low"),
    "Franklin & Marshall": ("phone","high"), "Franklin & Marshall College": ("phone","high"), "CNN/ORC": ("phone","high"),
    "Buckeye Poll": ("phone","low"), "The Columbus Dispatch": ("phone","medium"),
    "Landmark Communications": ("phone","low"), "CNN/SSRS": ("phone","high"), "OH Predictive Insights": ("online","medium"),
    "Keating Research/Magellan Strategies": ("phone","medium"), "Kaiser Family Foundation/CO Health Foundation/SSRS": ("phone","high"),
    "Strategies 360": ("phone","low"), "Morning Consult": ("online","medium"), "Commonwealth Leaders Fund": ("phone","low"),
    "DHM Research": ("phone","medium"), "Riley Research Associates": ("phone","low"), "Clout Research": ("phone","low"),
    "Causeway Solutions": ("online","low"), "The Tarrance Group": ("phone","medium"), "Garin-Hart-Yang": ("phone","medium"),
    "NYT Upshot/Siena": ("phone","high"), "Triton Polling & Research": ("phone","low"), "East Carolina University": ("phone","medium"),
    "Amber Integrated": ("online","low"), "The Political Matrix/The Listener Group": ("online","low"),
    "University of North Florida": ("phone","medium"), "Slingshot Strategies": ("online","low"), "Patriot Polling": ("online","low"),
    "Insider Advantage": ("online","low"),
}

# state -> pct population 65+ (rough ACS estimates)
STATE_AGE = {
    "FL":21.3,"GA":15.0,"WI":17.4,"NV":16.0,"KS":16.5,"MI":17.5,"OH":18.4,"IA":18.1,"SD":17.6,"CT":17.9,
    "PA":19.1,"AZ":18.2,"OR":18.9,"TX":13.1,"MN":16.5,"CO":15.0,"MD":16.1,"CA":15.2,"IL":16.4,
    "NM":18.3,"MA":17.3,"NY":16.0,"SC":17.2,"TN":16.4,
}
NAT_AVG_65 = mean(STATE_AGE.values())
K = 0.025
CONF_MULT = {"high":1.0,"medium":0.6,"low":0.3,"unknown":0}

def method_weight_factor(pollster, state):
    info = POLLSTER_METHOD.get(pollster)
    if not info: return 1.0
    mode, conf = info
    cm = CONF_MULT.get(conf, 0)
    if cm == 0: return 1.0
    dev = STATE_AGE.get(state, NAT_AVG_65) - NAT_AVG_65
    adj = 0
    if mode == 'online': adj = -K*dev
    elif mode == 'phone': adj = K*min(0,dev)
    return max(0.6, min(1.2, 1+adj*cm))

# races: (state, election_date, actual_margin, [(pollster_name, tag, date, D%, R%), ...])
races = {
    "FL 2018": ("FL", datetime(2018,11,6), 49.19-49.59, [
        ("The Trafalgar Group",'R',datetime(2018,11,5),47,50),("HarrisX",None,datetime(2018,11,5),49,46),
        ("St. Pete Polls",None,datetime(2018,11,4),50,45),("HarrisX",None,datetime(2018,11,4),48,46),
        ("Quinnipiac University",None,datetime(2018,11,4),50,43),("Emerson College",None,datetime(2018,11,3),51,46),
        ("HarrisX",None,datetime(2018,11,3),49,46),("Research Co.",None,datetime(2018,11,3),47,46),
        ("St. Pete Polls",None,datetime(2018,11,2),48,46),("HarrisX",None,datetime(2018,11,2),50,45)]),
    "GA 2018": ("GA", datetime(2018,11,6), 48.83-50.22, [
        ("The Trafalgar Group",'R',datetime(2018,11,3),40,52),("20/20 Insight",'D',datetime(2018,11,2),50,46),
        ("Emerson College",None,datetime(2018,10,31),47,49),("Cygnal",'R',datetime(2018,10,30),47,49),
        ("University of Georgia",None,datetime(2018,10,30),47,47),("Opinion Savvy",None,datetime(2018,10,29),48,47),
        ("Opinion Savvy",None,datetime(2018,10,22),48,48),("Marist College",None,datetime(2018,10,18),45,46)]),
    "WI 2018": ("WI", datetime(2018,11,6), 49.54-48.44, [
        ("Research Co.",None,datetime(2018,11,3),45,44),("Emerson College",None,datetime(2018,10,31),51,46),
        ("Marquette University",None,datetime(2018,10,28),47,47),("Ipsos",None,datetime(2018,10,18),48,45),
        ("Marquette University",None,datetime(2018,10,7),46,47),("Marist College",None,datetime(2018,10,3),50,42)]),
    "NV 2018": ("NV", datetime(2018,11,6), 49.39-45.31, [
        ("HarrisX",None,datetime(2018,11,5),45,44),("HarrisX",None,datetime(2018,11,4),44,45),
        ("Emerson College",None,datetime(2018,11,4),48,47),("HarrisX",None,datetime(2018,11,3),44,45),
        ("HarrisX",None,datetime(2018,11,2),43,47),("HarrisX",None,datetime(2018,11,1),43,46),
        ("The Trafalgar Group",'R',datetime(2018,11,1),45,47),("HarrisX",None,datetime(2018,10,31),45,45),
        ("HarrisX",None,datetime(2018,10,30),45,43)]),
    "KS 2018": ("KS", datetime(2018,11,6), 48.01-42.98, [
        ("Emerson College",None,datetime(2018,10,28),43,44),("Ipsos",None,datetime(2018,10,27),43,41),
        ("Public Policy Polling",'D',datetime(2018,10,20),41,41),("Remington Research Group",'R',datetime(2018,10,1),42,41)]),
    "MI 2018": ("MI", datetime(2018,11,6), 53.31-43.75, [
        ("Mitchell Research",None,datetime(2018,11,5),48,41),("Mitchell Research",None,datetime(2018,11,4),54,40),
        ("Change Research",None,datetime(2018,11,4),51,43),("Research Co.",None,datetime(2018,11,3),47,43),
        ("Glengariff Group",None,datetime(2018,10,27),50,38),("Emerson College",None,datetime(2018,10,26),52,41),
        ("Mitchell Research",None,datetime(2018,10,25),48,43),("Target-Insyght",None,datetime(2018,10,24),48,44)]),
    "OH 2018": ("OH", datetime(2018,11,6), 46.67-50.40, [
        ("Change Research",None,datetime(2018,11,4),48,43),("The Trafalgar Group",'R',datetime(2018,11,4),46,42),
        ("Research Co.",None,datetime(2018,11,3),44,44),("Cygnal",'R',datetime(2018,10,31),43,43),
        ("Gravis Marketing",None,datetime(2018,10,30),48,43),("Emerson College",None,datetime(2018,10,28),49,46),
        ("Baldwin Wallace University",None,datetime(2018,10,27),39,39)]),
    "IA 2018": ("IA", datetime(2018,11,6), 47.53-50.26, [
        ("Change Research",None,datetime(2018,11,4),49,46),("Selzer & Company",None,datetime(2018,11,2),46,44),
        ("Emerson College",None,datetime(2018,11,1),45,49),("University of Iowa",None,datetime(2018,10,22),48,40),
        ("Selzer & Company",None,datetime(2018,9,20),43,41),("Emerson College",None,datetime(2018,9,8),36,31)]),
    "SD 2018": ("SD", datetime(2018,11,6), 47.60-50.97, [
        ("Change Research",None,datetime(2018,11,4),51,45),("Emerson College",None,datetime(2018,11,4),47,48),
        ("Mason-Dixon",None,datetime(2018,10,31),44,47),("Mason-Dixon",None,datetime(2018,10,22),45,45),
        ("ALG Research",'D',datetime(2018,9,24),45,42)]),
    "CT 2018": ("CT", datetime(2018,11,6), 49.37-46.21, [
        ("Gravis Marketing",None,datetime(2018,11,1),46,37),("Sacred Heart University",None,datetime(2018,10,31),38,40),
        ("Emerson College",None,datetime(2018,10,29),46,39),("Quinnipiac University",None,datetime(2018,10,28),47,43),
        ("Sacred Heart University",None,datetime(2018,10,17),40,36),("Public Policy Polling",'D',datetime(2018,10,9),43,38),
        ("Quinnipiac University",None,datetime(2018,10,8),47,39),("Sacred Heart University",None,datetime(2018,9,17),43,37)]),
    "PA 2022": ("PA", datetime(2022,11,8), 56.49-41.71, [
        ("Research Co.",None,datetime(2022,11,6),53,41),("Targoz Market Research",None,datetime(2022,11,6),52,46),
        ("InsiderAdvantage",'R',datetime(2022,11,3),51,43),("The Trafalgar Group",'R',datetime(2022,11,3),50,45),
        ("Remington Research Group",'R',datetime(2022,11,2),52,40),("Marist College",None,datetime(2022,11,2),54,39),
        ("Susquehanna Polling & Research",'R',datetime(2022,11,1),52,38),("Emerson College",None,datetime(2022,10,31),50,41)]),
    "AZ 2022": ("AZ", datetime(2022,11,8), 50.32-49.65, [
        ("The Trafalgar Group",'R',datetime(2022,11,7),47,51),("Data Orbital",'R',datetime(2022,11,6),47,50),
        ("Research Co.",None,datetime(2022,11,6),47,49),("Data for Progress",'D',datetime(2022,11,6),48,52),
        ("Targoz Market Research",None,datetime(2022,11,6),48,50),("KAConsulting",'R',datetime(2022,11,3),45,49),
        ("InsiderAdvantage",'R',datetime(2022,11,2),48,51),("HighGround Inc.",None,datetime(2022,11,2),45,47),
        ("Remington Research Group",'R',datetime(2022,11,2),46,49)]),
    "WI 2022": ("WI", datetime(2022,11,8), 51.15-47.75, [
        ("Civiqs",None,datetime(2022,11,7),51,48),("Research Co.",None,datetime(2022,11,6),48,48),
        ("Data for Progress",'D',datetime(2022,11,5),48,50),("The Trafalgar Group",'R',datetime(2022,11,4),48,50),
        ("Marquette University",None,datetime(2022,11,1),48,48),("Siena College",None,datetime(2022,10,31),47,45),
        ("Fox News",None,datetime(2022,10,30),46,47),("Wick Insights",None,datetime(2022,10,30),47,48)]),
    "NV 2022": ("NV", datetime(2022,11,8), 47.30-48.81, [
        ("The Trafalgar Group",'R',datetime(2022,11,7),46,49),("Research Co.",None,datetime(2022,11,6),45,47),
        ("Data for Progress",'D',datetime(2022,11,6),46,48),("InsiderAdvantage",'R',datetime(2022,11,4),44,49),
        ("KAConsulting",'R',datetime(2022,11,3),43,45),("Cygnal",'R',datetime(2022,11,2),42,47),
        ("Emerson College",None,datetime(2022,10,29),45,49),("Suffolk University",None,datetime(2022,10,28),43,43)]),
    "OR 2022": ("OR", datetime(2022,11,8), 46.96-43.54, [
        ("Data for Progress",'D',datetime(2022,11,6),48,44),("Emerson College",None,datetime(2022,11,1),44,40),
        ("Nelson Research",None,datetime(2022,11,1),43,45),("Blueprint Polling",'D',datetime(2022,11,1),45,41),
        ("FM3 Research",'D',datetime(2022,10,26),40,38),("The Trafalgar Group",'R',datetime(2022,10,22),40,42),
        ("Hoffman Research Group",'R',datetime(2022,10,18),35,37)]),
    "MI 2022": ("MI", datetime(2022,11,8), 54.47-43.94, [
        ("The Trafalgar Group",'R',datetime(2022,11,7),48,49),("Cygnal",'R',datetime(2022,11,4),50,47),
        ("Mitchell Research",None,datetime(2022,11,3),50,48),("Cygnal",'R',datetime(2022,11,2),51,46),
        ("EPIC-MRA",None,datetime(2022,11,1),54,43),("Emerson College",None,datetime(2022,10,31),50,45),
        ("Cygnal",'R',datetime(2022,10,31),51,45)]),
    "TX 2022": ("TX", datetime(2022,11,8), 43.86-54.75, [
        ("CWS Research",'R',datetime(2022,11,5),42,53),("UT Tyler",None,datetime(2022,10,24),44,50),
        ("Emerson College",None,datetime(2022,10,19),42,52),("Siena College",None,datetime(2022,10,19),43,52),
        ("Beacon Research",'D',datetime(2022,10,19),45,48),("BSP Research",None,datetime(2022,10,18),42,46)]),
    "MN 2022": ("MN", datetime(2022,11,8), 52.27-44.61, [
        ("SurveyUSA",None,datetime(2022,10,30),51,43),("St. Cloud State University",None,datetime(2022,10,30),56,40),
        ("Trafalgar Group",'R',datetime(2022,10,19),45.8,46.3),("Embold Research",None,datetime(2022,10,14),47.0,42.4),
        ("SurveyUSA",None,datetime(2022,10,3),50,40),("Cygnal",'R',datetime(2022,9,26),47.6,44.2),
        ("Trafalgar Group",'R',datetime(2022,9,14),47.7,45.0),("Mason-Dixon",None,datetime(2022,9,14),48.0,41.0)]),
    "CO 2022": ("CO", datetime(2022,11,8), 58.53-39.18, [
        ("co/efficient",'R',datetime(2022,11,7),54,43),("Data for Progress",'D',datetime(2022,11,5),55,43),
        ("The Trafalgar Group",'R',datetime(2022,11,1),50,43),("Emerson College",None,datetime(2022,10,29),54,40),
        ("The Trafalgar Group",'R',datetime(2022,10,27),50,42),("CU Boulder/YouGov",None,datetime(2022,10,19),57,41),
        ("Civiqs",None,datetime(2022,10,18),55,40)]),
    "MD 2022": ("MD", datetime(2022,11,8), 64.53-32.12, [
        ("OpinionWorks",None,datetime(2022,10,23),58,27),("University of Maryland",None,datetime(2022,9,27),60,28),
        ("Goucher College",None,datetime(2022,9,12),53,31)]),
    "CA 2018": ("CA", datetime(2018,11,6), 61.95-38.05, [
        ("Change Research",None,datetime(2018,11,4),53,41),("Research Co.",None,datetime(2018,11,3),58,38),
        ("SurveyUSA",None,datetime(2018,11,2),53,38),("Probolsky Research",None,datetime(2018,10,30),47,37),
        ("Thomas Partners Strategies",None,datetime(2018,10,27),55,42),("Gravis Marketing",None,datetime(2018,10,26),55,35),
        ("UC Berkeley",None,datetime(2018,10,25),58,40)]),
    "CA 2022": ("CA", datetime(2022,11,8), 59.19-40.82, [
        ("Research Co.",None,datetime(2022,11,6),56,37),("USC",None,datetime(2022,11,2),62,38),
        ("UC Berkeley",None,datetime(2022,10,31),58,37),("ActiVote",None,datetime(2022,10,27),61,39),
        ("Public Policy Institute of California",None,datetime(2022,10,23),55,36),("SurveyUSA",None,datetime(2022,10,10),57,35),
        ("UC Berkeley",None,datetime(2022,9,27),53,32)]),
    "IL 2018": ("IL", datetime(2018,11,6), 54.53-38.83, [
        ("Victory Research",None,datetime(2018,11,3),49,33),("Ipsos",None,datetime(2018,10,5),50,30),
        ("Victory Research",None,datetime(2018,10,2),47,32),("Southern Illinois University",None,datetime(2018,9,29),49,27),
        ("ALG Research",'D',datetime(2018,9,25),48,32),("Research America Inc.",None,datetime(2018,9,13),44,27)]),
    "IL 2022": ("IL", datetime(2022,11,8), 54.91-42.37, [
        ("Victory Research",'R',datetime(2022,11,7),49,42),("Research Co.",None,datetime(2022,11,6),56,37),
        ("Civiqs",None,datetime(2022,10,25),56,39),("Emerson College",None,datetime(2022,10,24),50,41),
        ("University of Illinois Springfield",None,datetime(2022,10,25),55,40),("Osage Research",'R',datetime(2022,10,15),44,42)]),
    "NM 2018": ("NM", datetime(2018,11,6), 57.20-42.80, [
        ("Research Co.",None,datetime(2018,11,3),53,41),("Research & Polling, Inc.",None,datetime(2018,11,1),53,43),
        ("Carroll Strategies",None,datetime(2018,10,29),51,45),("Emerson College",None,datetime(2018,10,26),53,44),
        ("GQR Research",'D',datetime(2018,10,26),53,44),("Pacific Market Research",None,datetime(2018,10,24),48,39)]),
    "NM 2022": ("NM", datetime(2022,11,8), 51.97-45.59, [
        ("Emerson College",None,datetime(2022,10,28),49,46),("Research & Polling, Inc.",None,datetime(2022,10,27),50,42),
        ("SurveyUSA",None,datetime(2022,10,26),46,39),("The Trafalgar Group",'R',datetime(2022,10,21),46,47),
        ("Public Policy Polling",'D',datetime(2022,10,7),48,40),("SurveyUSA",None,datetime(2022,10,6),53,37)]),
    "MA 2018": ("MA", datetime(2018,11,6), 33.12-66.59, [
        ("MassINC",None,datetime(2018,10,28),25,68),("Suffolk University",None,datetime(2018,10,28),26,65),
        ("Western New England University",None,datetime(2018,10,27),27,65),("UMass Lowell",None,datetime(2018,10,7),27,66),
        ("MassINC",None,datetime(2018,9,21),24,68)]),

    # ============ 2014 cycle ============
    "FL 2014": ("FL", datetime(2014,11,4), -1.07, [
        ("St. Pete Polls",None,datetime(2014,11,2),46,46),("Public Policy Polling",None,datetime(2014,11,2),44,44),
        ("0ptimus",None,datetime(2014,11,2),41,43),("Quinnipiac University",None,datetime(2014,11,2),42,41),
        ("Zogby Analytics",None,datetime(2014,10,31),45,38),("YouGov",None,datetime(2014,10,31),41,41),
        ("SEA Polling",None,datetime(2014,10,30),44,46),("CBS News/NYT/YouGov",None,datetime(2014,10,23),45,46),
        ("Gravis Marketing",None,datetime(2014,10,24),44,42),("Rasmussen Reports",None,datetime(2014,10,17),47,47)]),
    "WI 2014": ("WI", datetime(2014,11,4), -5.67, [
        ("YouGov",None,datetime(2014,10,31),43,45),("Public Policy Polling",None,datetime(2014,10,30),47,48),
        ("Marquette University",None,datetime(2014,10,26),43,50),("CBS News/NYT/YouGov",None,datetime(2014,10,23),45,46),
        ("Rasmussen Reports",None,datetime(2014,10,21),49,48),("WPR/St. Norbert College",None,datetime(2014,10,21),46,47),
        ("Public Policy Polling",None,datetime(2014,10,18),46,47),("Marquette University",None,datetime(2014,10,12),47,47),
        ("Gravis Marketing",None,datetime(2014,10,4),46,50),("CBS News/NYT/YouGov",None,datetime(2014,10,1),49,48)]),
    "TX 2014": ("TX", datetime(2014,11,4), -20.37, [
        ("CBS News/NYT/YouGov",None,datetime(2014,10,23),37,57),("UoT/Texas Tribune",None,datetime(2014,10,19),38,54),
        ("Survey Research Center",None,datetime(2014,10,16),32,47),("Crosswind Communications",None,datetime(2014,10,12),31,52),
        ("Rasmussen Reports",None,datetime(2014,10,2),40,51),("CBS News/NYT/YouGov",None,datetime(2014,10,1),40,54),
        ("Texas Lyceum",None,datetime(2014,9,25),40,49),("Rasmussen Reports",None,datetime(2014,8,5),40,48),
        ("CBS News/NYT/YouGov",None,datetime(2014,7,24),37,54),("UoT/Texas Tribune",None,datetime(2014,6,8),32,44)]),
    "IL 2014": ("IL", datetime(2014,11,4), -3.92, [
        ("Public Policy Polling",None,datetime(2014,11,2),47,45),("McKeon & Associates",None,datetime(2014,10,28),45,42),
        ("We Ask America",None,datetime(2014,10,28),50,45),("CBS News/NYT/YouGov",None,datetime(2014,10,23),45,41),
        ("Rasmussen Reports",None,datetime(2014,10,22),47,48),("APC Research",None,datetime(2014,10,21),43,45),
        ("Southern Illinois University",None,datetime(2014,10,15),41,39),("We Ask America",None,datetime(2014,10,8),44,41),
        ("University of Illinois Springfield",None,datetime(2014,10,8),41,43),("CBS News/NYT/YouGov",None,datetime(2014,10,1),46,43)]),
    "KS 2014": ("KS", datetime(2014,11,4), -3.69, [
        ("Public Policy Polling",None,datetime(2014,11,3),45,46),("Public Policy Polling",None,datetime(2014,10,31),44,48),
        ("YouGov",None,datetime(2014,10,31),39,38),("Fox News",None,datetime(2014,10,30),42,48),
        ("Survey USA",None,datetime(2014,10,26),43,46),("CBS News/NYT/YouGov",None,datetime(2014,10,23),43,40),
        ("NBC News/Marist",None,datetime(2014,10,22),44,45),("Rasmussen Reports",None,datetime(2014,10,21),45,52),
        ("Monmouth University",None,datetime(2014,10,19),45,50),("Remington Research",None,datetime(2014,10,12),48,45)]),
    "MI 2014": ("MI", datetime(2014,11,4), -4.06, [
        ("Mitchell Research",None,datetime(2014,11,3),48,47),("Clarity Campaign Labs",None,datetime(2014,11,2),45,45),
        ("Public Policy Polling",None,datetime(2014,11,2),47,47),("EPIC-MRA",None,datetime(2014,10,28),45,43),
        ("Glengariff Group",None,datetime(2014,10,24),45,40),("CBS News/NYT/YouGov",None,datetime(2014,10,23),44,45),
        ("Rasmussen Reports",None,datetime(2014,10,22),49,46),("Marketing Resource Group",None,datetime(2014,10,1),46,41),
        ("Target-Insyght",None,datetime(2014,9,24),44,45),("Suffolk University",None,datetime(2014,9,10),43,45)]),
    "CO 2014": ("CO", datetime(2014,11,4), 3.35, [
        ("Public Policy Polling",None,datetime(2014,11,2),46,46),("Quinnipiac University",None,datetime(2014,11,2),44,45),
        ("YouGov",None,datetime(2014,10,31),44,42),("SurveyUSA",None,datetime(2014,10,29),46,46),
        ("Vox Populi Polling",None,datetime(2014,10,27),49,44),("CBS News/NYT/YouGov",None,datetime(2014,10,23),48,44),
        ("NBC News/Marist",None,datetime(2014,10,22),46,41),("CNN/ORC",None,datetime(2014,10,13),49,48),
        ("Rasmussen Reports",None,datetime(2014,9,30),50,46)]),
    "MA 2014": ("MA", datetime(2014,11,4), -1.86, [
        ("Public Policy Polling",None,datetime(2014,11,2),42,46),("WNEU",None,datetime(2014,10,30),41,46),
        ("Suffolk University",None,datetime(2014,10,29),43,46),("Boston Globe",None,datetime(2014,10,29),37,44),
        ("Emerson College",None,datetime(2014,10,29),42,48),("UMass Amherst",None,datetime(2014,10,27),47,44),
        ("WBUR/MassINC",None,datetime(2014,10,25),42,43),("UMass Lowell",None,datetime(2014,10,25),41,45)]),
    "MD 2014": ("MD", datetime(2014,11,4), -3.78, [
        ("Gonzales Research",None,datetime(2014,10,24),46,44),("WPA Opinion Research",'R',datetime(2014,10,24),39,44),
        ("CBS News/NYT/YouGov",None,datetime(2014,10,23),51,38),("WPA Opinion Research",'R',datetime(2014,10,20),42,41),
        ("Gravis Marketing",None,datetime(2014,10,9),46,43),("Baltimore Sun",None,datetime(2014,10,8),49,42),
        ("Washington Post",None,datetime(2014,10,5),47,38),("Gonzales Research",None,datetime(2014,9,23),47,43),
        ("OnMessage, Inc.",'R',datetime(2014,8,19),45,42)]),
    "PA 2014": ("PA", datetime(2014,11,4), 9.86, [
        ("Muhlenberg College",None,datetime(2014,10,29),51,39),("Magellan Strategies",None,datetime(2014,10,28),50,43),
        ("Harper Polling",None,datetime(2014,10,27),50,40),("Franklin & Marshall",None,datetime(2014,10,26),53,40),
        ("CBS News/NYT/YouGov",None,datetime(2014,10,23),52,39),("Magellan Strategies",None,datetime(2014,10,14),49,42),
        ("Quinnipiac University",None,datetime(2014,10,5),55,38),("CBS News/NYT/YouGov",None,datetime(2014,10,1),50,41)]),
    "CT 2014": ("CT", datetime(2014,11,4), 2.57, [
        ("Quinnipiac University",None,datetime(2014,11,2),47,44),("Public Policy Polling",None,datetime(2014,11,1),47,44),
        ("Rasmussen Reports",None,datetime(2014,10,30),48,47),("Quinnipiac University",None,datetime(2014,10,27),44,46),
        ("CBS News/NYT/YouGov",None,datetime(2014,10,23),40,40),("Quinnipiac University",None,datetime(2014,10,20),45,45),
        ("Rasmussen Reports",None,datetime(2014,10,16),43,50),("Quinnipiac University",None,datetime(2014,10,6),46,46),
        ("Public Policy Polling",None,datetime(2014,10,5),45,39),("CBS News/NYT/YouGov",None,datetime(2014,10,1),41,41)]),
    "OH 2014": ("OH", datetime(2014,11,4), -30.61, [
        ("The Columbus Dispatch",None,datetime(2014,10,31),34,62),("Fox News",None,datetime(2014,10,30),36,51),
        ("CBS News/NYT/YouGov",None,datetime(2014,10,23),35,54),("CBS News/NYT/YouGov",None,datetime(2014,10,1),36,52),
        ("Quinnipiac University",None,datetime(2014,9,29),35,57),("The Columbus Dispatch",None,datetime(2014,9,5),29,59),
        ("Rasmussen Reports",None,datetime(2014,9,9),30,50),("CBS News/NYT/YouGov",None,datetime(2014,9,2),37,50),
        ("Buckeye Poll",None,datetime(2014,8,31),27,46),("Public Policy Polling",None,datetime(2014,8,9),44,50)]),
    "GA 2014": ("GA", datetime(2014,11,4), 44.88-52.74, [
        ("Public Policy Polling",None,datetime(2014,11,3),43,47),("Landmark Communications",None,datetime(2014,11,2),45,51),
        ("Insider Advantage",None,datetime(2014,11,2),44,47),("SurveyUSA",None,datetime(2014,11,2),42,47),
        ("YouGov",None,datetime(2014,10,31),41,45),("NBC News/Marist",None,datetime(2014,10,30),42,46),
        ("Monmouth",None,datetime(2014,10,28),42,48),("Rasmussen Reports",None,datetime(2014,10,27),43,49)]),
    "NY 2014": ("NY", datetime(2014,11,4), 54.19-40.24, [
        ("Zogby Analytics",None,datetime(2014,10,31),55,34),("Marist College",None,datetime(2014,10,28),56,30),
        ("CBS News/NYT/YouGov",None,datetime(2014,10,23),56,31),("Siena College",None,datetime(2014,10,20),54,33),
        ("Siena College",None,datetime(2014,9,23),56,27),("Quinnipiac University",None,datetime(2014,10,6),55,34),
        ("CBS News/NYT/YouGov",None,datetime(2014,10,1),57,30),("Rasmussen Reports",None,datetime(2014,9,23),49,32)]),

    # ============ additional 2018/2022 states ============
    "AZ 2018": ("AZ", datetime(2018,11,6), 41.84-56.00, [
        ("HarrisX",None,datetime(2018,11,5),39,53),("Emerson College",None,datetime(2018,11,3),40,55),
        ("Research Co.",None,datetime(2018,11,3),39,54),("Gravis Marketing",None,datetime(2018,11,2),40,53),
        ("Fox News",None,datetime(2018,10,29),35,54),("CNN/SSRS",None,datetime(2018,10,29),43,52),
        ("Marist College",None,datetime(2018,10,27),41,55),("YouGov",None,datetime(2018,10,26),41,52),
        ("OH Predictive Insights",None,datetime(2018,10,23),39,57)]),
    "CO 2018": ("CO", datetime(2018,11,6), 53.42-42.80, [
        ("Magellan Strategies",None,datetime(2018,10,30),45,40),
        ("Keating Research/OnSight Public Affairs/Martin Campaigns",None,datetime(2018,10,30),50,42),
        ("University of Colorado/YouGov",None,datetime(2018,10,17),54,42),("Magellan Strategies",None,datetime(2018,10,10),47,40),
        ("Keating Research/Magellan Strategies",None,datetime(2018,9,20),47,40),
        ("Kaiser Family Foundation/CO Health Foundation/SSRS",None,datetime(2018,9,19),44,33),
        ("Public Policy Polling",'D',datetime(2018,6,28),47,40),("Strategies 360",None,datetime(2018,6,6),42,37)]),
    "PA 2018": ("PA", datetime(2018,11,6), 57.77-40.70, [
        ("Change Research",None,datetime(2018,11,4),53,42),("Research Co.",None,datetime(2018,11,3),54,39),
        ("Muhlenberg College",None,datetime(2018,11,1),58,37),("Franklin & Marshall College",None,datetime(2018,10,28),57,27),
        ("Morning Consult",None,datetime(2018,10,2),48,36),("Ipsos",None,datetime(2018,9,20),55,38),
        ("Commonwealth Leaders Fund",'R',datetime(2018,8,15),46,43),("Marist College",None,datetime(2018,8,16),54,40)]),
    "OR 2018": ("OR", datetime(2018,11,6), 50.05-43.65, [
        ("Hoffman Research Group",None,datetime(2018,10,30),45,42),("Emerson College",None,datetime(2018,10,28),47,42),
        ("DHM Research",None,datetime(2018,10,11),40,35),("Riley Research Associates",None,datetime(2018,10,7),49,45),
        ("Clout Research",'R',datetime(2018,9,23),42,41),("Hoffman Research Group",None,datetime(2018,9,13),46,36),
        ("Causeway Solutions",'R',datetime(2018,9,11),41,43),("Gravis Marketing",None,datetime(2018,7,17),45,45)]),
    "SC 2018": ("SC", datetime(2018,11,6), -8.04, [
        ("The Trafalgar Group",'R',datetime(2018,10,31),38,54),("The Trafalgar Group",'R',datetime(2018,10,14),32,56),
        ("The Trafalgar Group",'R',datetime(2018,10,2),37,51),("The Tarrance Group",'R',datetime(2018,8,13),41,52),
        ("Garin-Hart-Yang",'D',datetime(2018,8,9),43,47)]),
    "TN 2018": ("TN", datetime(2018,11,6), -21.01, [
        ("Targoz Market Research",None,datetime(2018,10,31),44,53),("Emerson College",None,datetime(2018,10,30),41,54),
        ("Fox News",None,datetime(2018,10,30),37,54),("Vox Populi Polling",None,datetime(2018,10,29),44,56),
        ("CNN/SSRS",None,datetime(2018,10,29),42,52),("Marist College",None,datetime(2018,10,27),40,57),
        ("NYT Upshot/Siena",None,datetime(2018,10,11),33,59),("Triton Polling & Research",'R',datetime(2018,9,12),37,54)]),
    "GA 2022": ("GA", datetime(2022,11,8), -7.53, [
        ("Landmark Communications",None,datetime(2022,11,7),46,52),("InsiderAdvantage",'R',datetime(2022,11,6),45,50),
        ("Research Co.",None,datetime(2022,11,6),44,51),("The Trafalgar Group",'R',datetime(2022,11,6),44,53),
        ("Data for Progress",'D',datetime(2022,11,6),45,54),("East Carolina University",None,datetime(2022,11,5),46,53),
        ("Amber Integrated",'R',datetime(2022,11,2),43,52),("Echelon Insights",None,datetime(2022,11,2),43,50)]),
    "FL 2022": ("FL", datetime(2022,11,8), -19.40, [
        ("The Political Matrix/The Listener Group",'R',datetime(2022,11,7),48,52),("Research Co.",None,datetime(2022,11,6),41,54),
        ("Data for Progress",'D',datetime(2022,11,6),42,57),("Amber Integrated",'R',datetime(2022,11,2),40,53),
        ("Civiqs",None,datetime(2022,11,2),45,54),("InsiderAdvantage",'R',datetime(2022,11,1),43,53),
        ("Siena College",None,datetime(2022,11,1),42,54),("University of North Florida",None,datetime(2022,10,24),41,55)]),
    "OH 2022": ("OH", datetime(2022,11,8), -25.03, [
        ("Civiqs",None,datetime(2022,11,7),39,53),("Research Co.",None,datetime(2022,11,6),37,57),
        ("Targoz Market Research",None,datetime(2022,11,6),32,62),("The Trafalgar Group",'R',datetime(2022,11,5),34,59),
        ("Data for Progress",'D',datetime(2022,11,5),38,62),("Cygnal",'R',datetime(2022,11,3),37,56),
        ("Remington Research Group",'R',datetime(2022,11,2),35,58),("Emerson College",None,datetime(2022,11,1),34,55)]),
    "NY 2022": ("NY", datetime(2022,11,8), 6.39, [
        ("Research Co.",None,datetime(2022,11,6),49,41),("Patriot Polling",None,datetime(2022,11,3),49,44),
        ("Emerson College",None,datetime(2022,10,31),52,44),("The Trafalgar Group",'R',datetime(2022,10,31),48,48),
        ("KAConsulting",'R',datetime(2022,10,29),46,45),("Data for Progress",'D',datetime(2022,10,28),54,42),
        ("Slingshot Strategies",'D',datetime(2022,10,26),48,42),("Civiqs",None,datetime(2022,10,25),54,43)]),
}

print(f"Total races: {len(races)}\n")
results = {}
for name, (state, edate, actual, polls) in races.items():
    w_plain, w_mw = 0,0
    d_plain, r_plain = 0,0
    d_mw, r_mw = 0,0
    for pollster, tag, date, d, rp in polls:
        hw = house_weight(tag); rw = recency_weight(date, edate)
        w0 = hw*rw
        mwf = method_weight_factor(pollster, state)
        w1 = w0*mwf
        w_plain += w0; d_plain += w0*d; r_plain += w0*rp
        w_mw += w1; d_mw += w1*d; r_mw += w1*rp
    pm_plain = d_plain/w_plain - r_plain/w_plain
    pm_mw = d_mw/w_mw - r_mw/w_mw
    results[name] = {'poll_plain': pm_plain, 'poll_mw': pm_mw, 'actual': actual,
                      'err_plain': actual-pm_plain, 'err_mw': actual-pm_mw}

for name, v in results.items():
    print(f"  {name:10} plain={v['poll_plain']:+7.2f} mw={v['poll_mw']:+7.2f} actual={v['actual']:+7.2f}  err_plain={v['err_plain']:+6.2f} err_mw={v['err_mw']:+6.2f}")

errs_plain = [v['err_plain'] for v in results.values()]
errs_mw = [v['err_mw'] for v in results.values()]
print()
print(f"WITHOUT MethodWeight: mean={mean(errs_plain):+.3f} pop_stdev={pstdev(errs_plain):.3f}")
print(f"WITH    MethodWeight: mean={mean(errs_mw):+.3f} pop_stdev={pstdev(errs_mw):.3f}")
print()

nd = NormalDist()
def score(margins_actuals, sigma):
    n=len(margins_actuals); brier=0; ll=0
    for pm, am in margins_actuals:
        p = nd.cdf(pm/sigma); y = 1 if am>0 else 0
        brier += (p-y)**2
        pc = min(max(p,1e-6),1-1e-6)
        ll += -(y*math.log(pc)+(1-y)*math.log(1-pc))
    return brier/n, ll/n

pairs_plain = [(v['poll_plain'], v['actual']) for v in results.values()]
pairs_mw = [(v['poll_mw'], v['actual']) for v in results.values()]

print(f"{'sigma':>6} | {'Brier(plain)':>13} {'LogLoss(plain)':>15} | {'Brier(MW)':>10} {'LogLoss(MW)':>12}")
best_plain, best_mw = (None,1e9), (None,1e9)
for sigma in [x/2 for x in range(8,26)]:
    bp, lp = score(pairs_plain, sigma)
    bm, lm = score(pairs_mw, sigma)
    if bp<best_plain[1]: best_plain=(sigma,bp)
    if bm<best_mw[1]: best_mw=(sigma,bm)
    marker = " <=6.21" if abs(sigma-6.21)<0.26 else ""
    print(f"{sigma:6.2f} | {bp:13.4f} {lp:15.4f} | {bm:10.4f} {lm:12.4f}{marker}")
print()
print(f"Best sigma (plain, by Brier): {best_plain[0]} -> {best_plain[1]:.4f}")
print(f"Best sigma (MethodWeight, by Brier): {best_mw[0]} -> {best_mw[1]:.4f}")

# ---- Monte Carlo coverage test (10-90 interval) using sigma=6.21 ----
print()
print("=== Monte Carlo 10-90 interval coverage test (sigma=6.21, actual _runMC2026-style sampling) ===")
random.seed(42)
SIGMA = 6.21
N_SAMPLES = 5000
covered = 0
for name, v in results.items():
    pm = v['poll_plain']
    samples = sorted(random.gauss(pm, SIGMA) for _ in range(N_SAMPLES))
    lo = samples[int(N_SAMPLES*0.10)]
    hi = samples[int(N_SAMPLES*0.90)]
    is_covered = lo <= v['actual'] <= hi
    if is_covered: covered += 1
    print(f"  {name:10} pred_10_90=[{lo:+6.2f},{hi:+6.2f}]  actual={v['actual']:+6.2f}  {'COVERED' if is_covered else 'MISSED'}")

n = len(results)
print(f"\nCoverage: {covered}/{n} = {covered/n*100:.1f}% (target: 80%)")
